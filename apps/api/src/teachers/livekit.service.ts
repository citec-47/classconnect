import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  EncodingOptions,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  RoomServiceClient,
  S3Upload,
  TrackSource,
} from 'livekit-server-sdk';
import { AppError } from '../common/http-exception.filter';
import { RecordingStorageService } from '../files/recording-storage.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { CONFIG_KEYS } from '@classconnect/shared';

/** What a participant may do once they are in the room. */
export interface RoomGrant {
  /** The LiveKit room, which is `Session.roomId`. */
  roomId: string;
  /** Stable across reconnects, so a rejoin replaces rather than duplicates. */
  identity: string;
  displayName: string;
  /**
   * May this participant send media at all?
   *
   * Everyone admitted to the room can: a learner joins with their camera, so the
   * class is a room of faces rather than a teacher talking to a list of names.
   * What a learner cannot do is *speak* — see `canSpeak`.
   *
   * Enforced here in the token rather than by hiding a button, because a hidden
   * button is not an access control: the grant is signed and the media server
   * refuses anything the token does not carry.
   */
  canPublish: boolean;
  /**
   * May this participant be heard?
   *
   * The teacher always can. A learner cannot until the teacher grants them the
   * floor — FR-LIV: the class listens, and speaks when chosen. This used to be
   * the same flag as `canPublish`, which made "may not speak" and "may not
   * appear" one decision; they are two, and only the first is what the floor is
   * about. A learner who has not been called on still has a face.
   *
   * The distinction is what makes a room of thirty children workable: thirty
   * cameras is a class, thirty open microphones is nothing at all.
   */
  canSpeak: boolean;
  /**
   * May this participant share their screen?
   *
   * Separate from `canPublish` because the two are different permissions, and
   * `canPublish` alone grants every source there is: a learner allowed to answer
   * a question could also put their screen in front of the class. FR-LIV-005
   * says sharing is its own grant, and this is where that becomes true rather
   * than merely intended.
   *
   * The host is the exception and is granted it on sight — it is their lesson.
   */
  screenShare?: boolean;
}

/**
 * SI-005 — LiveKit, the media server live lessons run on.
 *
 * ## Why tokens are minted here and never in the browser
 *
 * The API secret signs a grant naming the room, the identity and what that
 * identity may do. Anyone holding the secret can mint a token for any room as
 * anybody — so it stays on the server, and the browser receives a token that is
 * short-lived, scoped to one room, and carries exactly the permissions the
 * platform decided.
 *
 * A learner's token therefore cannot publish. Not "the microphone button is
 * hidden" — the server refuses the track.
 *
 * ## Not configured is a normal state
 *
 * `configured` is false when the keys are absent, and every caller checks it.
 * A developer without LiveKit credentials should get a clear refusal on the one
 * endpoint that needs them, not a crash at boot that stops the whole API.
 */
@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);

  private readonly url: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    env: ConfigService,
    private readonly storage: RecordingStorageService,
    private readonly platformConfig: PlatformConfigService,
  ) {
    this.url = env.get<string>('LIVEKIT_URL') ?? '';
    this.apiKey = env.get<string>('LIVEKIT_API_KEY') ?? '';
    this.apiSecret = env.get<string>('LIVEKIT_API_SECRET') ?? '';
  }

  get configured(): boolean {
    return Boolean(this.url && this.apiKey && this.apiSecret);
  }

  /**
   * Whether a lesson started right now could actually be recorded.
   *
   * Asked *before* going live rather than discovered afterwards. Recording needs
   * two separate things — a media server to record, and somewhere to put the
   * file — and the second was silently absent for weeks: every lesson went ahead,
   * the warning went to a log nobody reads, and the teacher's screen said
   * "Recording: No" without saying why. A safeguarding control that fails quietly
   * is one nobody notices has failed.
   *
   * Returns the reason rather than a boolean so the screen can name it, and so
   * "no media server" and "nowhere to store it" stay distinguishable — they are
   * fixed in completely different places.
   */
  get recordingUnavailableReason(): 'media_server' | 'storage' | null {
    if (!this.configured) return 'media_server';
    if (!this.recordingStorage) return 'storage';
    return null;
  }

  /**
   * A short-lived token for one participant in one room.
   *
   * Ten minutes: long enough to survive a slow join on §6.2's network, short
   * enough that a token copied out of a browser is useless by the time anyone
   * uses it. It authorises *joining* — once connected, the participant stays as
   * long as the room does, so this is not a lesson-length limit.
   */
  async issueToken(grant: RoomGrant): Promise<{ url: string; token: string }> {
    if (!this.configured) {
      throw AppError.serviceUnavailable('errors.live.not_configured');
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: grant.identity,
      name: grant.displayName,
      ttl: '10m',
    });

    token.addGrant({
      room: grant.roomId,
      roomJoin: true,
      canPublish: grant.canPublish,
      /*
       * Which sources, not merely whether.
       *
       * `canPublish: true` on its own authorises every track source LiveKit
       * knows, screen share included — so a learner granted the floor to answer
       * a question could also start sharing their screen to the class, and the
       * media server would accept it. Naming the sources is what makes the
       * screen a separate permission rather than a button we chose not to draw.
       *
       * This is also how the grant survives a reload: the token minted on the
       * next join is built from the same database state, so somebody who was
       * allowed to share comes back able to, and everybody else comes back
       * unable to, without anyone re-approving anything.
       */
      canPublishSources: grant.canPublish
        ? [
            /*
             * The camera is the baseline, the microphone is the grant.
             *
             * Listing MICROPHONE unconditionally would hand every learner an
             * open microphone the moment they joined, and the floor would be a
             * suggestion. Listing neither — which is what `canPublish: false`
             * did — cost them their face as well as their voice, for a rule
             * that was only ever about the voice.
             */
            TrackSource.CAMERA,
            ...(grant.canSpeak ? [TrackSource.MICROPHONE] : []),
            ...(grant.screenShare
              ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
              : []),
          ]
        : [],
      /*
       * Everyone subscribes, including a learner who may not speak — that is
       * how they see and hear the lesson.
       */
      canSubscribe: true,
      /*
       * Data messages carry the chat and the raise-a-hand signal, which every
       * learner needs whether or not they hold the floor.
       */
      canPublishData: true,
    });

    return { url: this.clientUrl, token: await token.toJwt() };
  }

  /**
   * The address the *browser* should dial, which is not always LiveKit's.
   *
   * Where `LIVEKIT_PROXY_URL` is set, the browser connects to this API instead
   * and the signalling is relayed onwards. That exists because a browser
   * refusing a third-party origin — an extension, tracking protection, a
   * corporate proxy — cannot be overruled from inside the page, and the only
   * thing an application can change is which origin it asks for. The API is one
   * the browser already trusts.
   *
   * Unset, this is LiveKit's own URL and nothing is relayed, which is what a
   * deployed platform on its own domain should use.
   */
  private get clientUrl(): string {
    return process.env.LIVEKIT_PROXY_URL || this.url;
  }

  /**
   * Grants or withdraws the floor on a participant who is already connected.
   *
   * Re-issuing a token would mean disconnecting and rejoining, dropping the
   * learner out of the lesson to let them answer a question. This updates the
   * live permission in place, so the microphone simply becomes available.
   */
  async setCanPublish(
    roomId: string,
    identity: string,
    canSpeak: boolean,
    screenShare = false,
  ): Promise<void> {
    if (!this.configured) return;

    const rooms = new RoomServiceClient(this.httpUrl, this.apiKey, this.apiSecret);
    try {
      await rooms.updateParticipant(roomId, identity, undefined, {
        /*
         * Always true, because the camera is not what the floor governs.
         *
         * Withdrawing the floor used to set this false, which took the
         * learner's camera down with their microphone — they vanished from the
         * class for having finished answering a question.
         */
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        /*
         * Sent on every update, including the revoking one.
         *
         * Permissions are replaced rather than merged, so omitting the sources
         * when withdrawing a share would leave the participant with the blanket
         * `canPublish` and their screen still going out to the class. Revoking
         * has to say what remains, not only what stops.
         */
        canPublishSources: [
          TrackSource.CAMERA,
          ...(canSpeak ? [TrackSource.MICROPHONE] : []),
          ...(screenShare ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : []),
        ],
      });
    } catch (error) {
      /*
       * Not fatal. The platform's record of who holds the floor is the database
       * row; this is the media server catching up with it. A learner who was
       * granted the floor and cannot yet speak is a worse outcome than a log
       * line, but it is recoverable — and throwing here would roll back the
       * grant the teacher just made.
       */
      this.logger.error(
        `Could not update ${identity} in ${roomId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Silences, or darkens, everyone in the room except the host.
   *
   * Muting server-side rather than asking each browser to mute itself, because
   * a request the client can decline is not a control a teacher can rely on —
   * and the one occasion this gets used is the one where a room has got away
   * from them.
   *
   * The track is muted, not the permission revoked. A muted learner can be
   * unmuted by the teacher or, for their camera, turn it back on themselves;
   * revoking the source instead would need a second round trip to undo and
   * would fight with whatever the floor already says. Quieting a room is a
   * moment, not a change of policy.
   *
   * Returns how many tracks were actually muted, so the teacher is told
   * "muted 12" rather than left wondering whether the button did anything.
   */
  async muteEveryoneExcept(
    roomId: string,
    hostIdentity: string,
    source: 'camera' | 'microphone',
  ): Promise<number> {
    if (!this.configured) return 0;

    const wanted = source === 'camera' ? TrackSource.CAMERA : TrackSource.MICROPHONE;
    const rooms = new RoomServiceClient(this.httpUrl, this.apiKey, this.apiSecret);
    let muted = 0;

    try {
      const participants = await rooms.listParticipants(roomId);
      for (const participant of participants) {
        if (participant.identity === hostIdentity) continue;
        for (const track of participant.tracks) {
          if (track.source !== wanted || track.muted) continue;
          /*
           * One failure must not stop the rest. "Mute all" that stopped at the
           * first participant who had already left would leave the loudest half
           * of the room untouched, which is the opposite of what was asked.
           */
          try {
            await rooms.mutePublishedTrack(roomId, participant.identity, track.sid, true);
            muted += 1;
          } catch (error) {
            this.logger.warn(
              `Could not mute ${source} for ${participant.identity} in ${roomId}: ` +
                `${(error as Error).message}`,
            );
          }
        }
      }
    } catch (error) {
      // Same reasoning as `setCanPublish`: the media server is the thing
      // catching up here, and throwing would turn a partial success into an
      // error message over a room that did in fact go quiet.
      this.logger.error(
        `Could not list participants in ${roomId}: ${(error as Error).message}`,
      );
    }

    return muted;
  }

  /**
   * Starts recording the room to S3-compatible storage.
   *
   * FR-LIV: every live lesson is recorded automatically and only an admin may
   * delete it. Recording is started server-side when the room opens rather than
   * by the teacher, because a lesson nobody remembered to record is exactly the
   * one somebody will need.
   *
   * Returns the egress id so the session row can hold it; null when LiveKit is
   * not configured or refuses, because a failed recording must not prevent the
   * class from happening.
   */
  async startRecording(roomId: string): Promise<string | null> {
    if (!this.configured) return null;

    /*
     * Where the recording is *kept*, which LiveKit will not guess.
     *
     * A file path on its own is not a destination: LiveKit refuses the request
     * with "missing or invalid field: output" — an accurate message that reads
     * like a malformed call rather than absent credentials, which is how this
     * sat silently failing while the platform reported recording as simply off.
     *
     * Any S3-compatible store works: AWS, Cloudflare R2, Backblaze B2, MinIO.
     * Without one, recording cannot happen at all, so this says so once, loudly,
     * instead of failing per lesson in a way nobody reads.
     */
    const storage = this.recordingStorage;
    if (!storage) {
      this.logger.warn(
        `Not recording ${roomId}: no storage configured. ` +
          'Set LIVEKIT_S3_BUCKET, LIVEKIT_S3_REGION, LIVEKIT_S3_ACCESS_KEY and ' +
          'LIVEKIT_S3_SECRET (LIVEKIT_S3_ENDPOINT too for R2, B2 or MinIO).',
      );
      return null;
    }

    /*
     * The room has to exist before anything can be recorded in it.
     *
     * LiveKit creates a room when its first participant arrives, and recording
     * starts when the teacher goes live — a moment earlier, while the browser is
     * still fetching its token. Egress was therefore asked to record a room that
     * did not exist yet and refused with "requested room does not exist", every
     * time, for every lesson. Creating it up front also means the recording
     * captures the opening of the lesson rather than joining it late.
     */
    await this.ensureRoom(roomId);

    const egress = new EgressClient(this.httpUrl, this.apiKey, this.apiSecret);
    try {
      /*
       * `EncodedFileOutput`, not a plain object.
       *
       * The SDK's types are generated from protobuf messages, which carry
       * methods (`clone`, `equals`, …) beyond their fields — a structurally
       * similar literal does not satisfy them.
       */
      /*
       * Segmented HLS, not one MP4.
       *
       * The Supabase free plan rejects any object over 50 MB with a 413, and
       * that limit is fixed — only Pro can change it. A 45-minute lesson as a
       * single file is around a gigabyte, so it failed mid-upload every time
       * and the platform correctly reported no recording. Six-second segments
       * are a few hundred kilobytes each, so no object ever approaches the
       * limit, whatever the lesson's length.
       *
       * It is also the better shape for the students this is for: playback
       * starts on the first segment instead of after a gigabyte, and a dropped
       * connection resumes at a segment boundary rather than at the beginning.
       */
      const info = await egress.startRoomCompositeEgress(
        roomId,
        {
          segments: new SegmentedFileOutput({
            protocol: SegmentedFileProtocol.HLS_PROTOCOL,
            /* One folder per room, so a lesson's segments stay together. */
            filenamePrefix: `${LiveKitService.recordingPrefix(roomId)}segment`,
            playlistName: `${LiveKitService.recordingPrefix(roomId)}index.m3u8`,
            segmentDuration: 6,
            output: { case: 's3', value: storage },
          }),
        },
        {
          /*
           * `speaker`, so a shared screen is what the recording shows.
           *
           * The default grid gives every participant an equal square, which for
           * a lesson about what is on the teacher's screen means the screen
           * arrives as one thumbnail among several and nothing on it can be
           * read. This layout promotes the active speaker — and a screen share
           * when there is one — to the main frame, which is the same rule the
           * room applies on screen.
           */
          layout: 'speaker',
          /*
           * The size is configuration, because it is a trade with no free side.
           *
           * 720p by default, so text on a shared screen can be read — a
           * recording of a lesson about a screen nobody can read is worthless,
           * whatever it costs to store. The price is real and is the admin's to
           * pay or not: roughly 500 MB for a 45-minute lesson against 200 MB at
           * 360p, so a 1 GB bucket holds two lessons instead of five.
           *
           * Read here rather than held as a constant, so dropping back to 360
           * the day storage bites is a setting and not a deployment. It takes
           * effect on the next lesson: LiveKit encodes one composite at one
           * size and cannot be re-sized part-way through.
           *
           * Audio does not scale with the picture — a lesson survives a blurry
           * diagram far better than it survives a teacher who cannot be
           * understood — so cutting the video back leaves the voice alone.
           */
          encodingOptions: new EncodingOptions(this.recordingEncoding),
        },
      );
      return info.egressId ?? null;
    } catch (error) {
      this.logger.error(`Could not start recording ${roomId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * The S3-compatible destination recordings are written to, or null.
   *
   * Read per call rather than cached at construction so that adding the keys
   * and restarting is the whole of the setup — there is no second place to
   * change and nothing to invalidate.
   *
   * `endpoint` is what makes this work with Cloudflare R2, Backblaze B2 and
   * MinIO as well as AWS; left unset it is AWS, which is the only one that
   * needs no endpoint.
   */
  private get recordingStorage(): S3Upload | null {
    const bucket = process.env.LIVEKIT_S3_BUCKET;
    const accessKey = process.env.LIVEKIT_S3_ACCESS_KEY;
    const secret = process.env.LIVEKIT_S3_SECRET;
    if (!bucket || !accessKey || !secret) return null;

    return new S3Upload({
      bucket,
      accessKey,
      secret,
      region: process.env.LIVEKIT_S3_REGION || 'auto',
      endpoint: process.env.LIVEKIT_S3_ENDPOINT || undefined,
      /*
       * R2 and B2 reject the checksum header AWS sends by default, with an
       * error naming neither the header nor the remedy. Off is correct for
       * every S3-compatible store and harmless on AWS itself.
       */
      forcePathStyle: Boolean(process.env.LIVEKIT_S3_ENDPOINT),
    });
  }

  /**
   * Makes sure the room exists, so egress has something to attach to.
   *
   * Idempotent: LiveKit returns the existing room rather than erroring, so this
   * is safe on a rejoin. A failure here is logged and swallowed — the class
   * matters more than the recording, and the join that follows will create the
   * room anyway.
   */
  private async ensureRoom(roomId: string): Promise<void> {
    const rooms = new RoomServiceClient(this.httpUrl, this.apiKey, this.apiSecret);
    try {
      await rooms.createRoom({ name: roomId });
    } catch (error) {
      this.logger.error(`Could not create room ${roomId}: ${(error as Error).message}`);
    }
  }

  /**
   * What a finished egress actually produced, or null.
   *
   * Asked for after stopping rather than waiting on a webhook, because a webhook
   * needs a publicly reachable URL and this platform is developed on a laptop
   * behind a Cameroonian domestic connection. The trade is honest: this is a few
   * seconds of polling at the end of a lesson instead of infrastructure nobody
   * has yet, and the webhook can replace it later without changing the caller.
   *
   * The file is written by LiveKit's own uploader, so this waits for the upload
   * to finish rather than assuming it: a size of zero means the object is not
   * there yet, and reporting a recording that has not landed is exactly the lie
   * this platform keeps telling itself.
   */
  async recordingResult(
    egressId: string,
    roomId: string,
  ): Promise<{ storageKey: string; durationSec: number; sizeBytes: number; segmentCount: number } | null> {
    if (!this.configured) return null;

    /*
     * The playlist path is known without asking anybody.
     *
     * `startRecording` chose it, so it can be reconstructed here rather than
     * read back — which is the whole fix. LiveKit reported a completed egress
     * with empty `segmentResults`, the ingest believed it, and a lesson sitting
     * in the bucket was filed as never recorded. A derived path checked against
     * the store cannot disagree with itself that way.
     */
    const playlistKey = `${LiveKitService.recordingPrefix(roomId)}index.m3u8`;
    const egress = new EgressClient(this.httpUrl, this.apiKey, this.apiSecret);

    /*
     * Six attempts, five seconds apart. Composing and uploading a lesson takes
     * longer than stopping it does, and giving up immediately would file every
     * recording as failed while the segments were still being written.
     */
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const found = await this.storedRecording(roomId, playlistKey);
      if (found) return found;

      /*
       * Egress is still consulted — for the one thing it answers reliably.
       *
       * Not for *what* was produced, which is what proved unreliable, but for
       * whether it has given up. A failed or aborted egress will never write
       * anything, so waiting the full thirty seconds only delays telling the
       * truth.
       */
      try {
        const [info] = await egress.listEgress({ egressId });
        if (info && ['EGRESS_FAILED', 'EGRESS_ABORTED'].includes(String(info.status))) {
          this.logger.error(`Egress ${egressId} ended as ${info.status}: ${info.error ?? ''}`);
          /*
           * Checked once more even so. An abort during upload can still leave a
           * usable playlist behind, and a partial lesson is worth more to the
           * class than nothing.
           */
          return this.storedRecording(roomId, playlistKey);
        }
      } catch (error) {
        this.logger.error(`Could not read egress ${egressId}: ${(error as Error).message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    this.logger.error(`Egress ${egressId} left nothing under ${playlistKey} within 30s`);
    return null;
  }

  /**
   * The composite's size and bitrates, from configuration.
   *
   * Width is derived from height at 16:9 rather than configured separately: two
   * numbers that must agree are two numbers that will eventually not, and an
   * admin who sets a height has not agreed to think about aspect ratios.
   *
   * Framerate stays at 15. A lesson is a person talking and a screen being
   * pointed at; doubling the frames doubles the file to no benefit either the
   * teacher or the student would notice.
   */
  private get recordingEncoding(): {
    width: number;
    height: number;
    framerate: number;
    videoBitrate: number;
    audioBitrate: number;
  } {
    const height = this.platformConfig.getNumber(CONFIG_KEYS.RECORDING_HEIGHT_PX);
    return {
      /* Even numbers only: H.264 rejects odd dimensions. */
      width: Math.round((height * 16) / 9 / 2) * 2,
      height,
      framerate: 15,
      videoBitrate: this.platformConfig.getNumber(CONFIG_KEYS.RECORDING_VIDEO_BITRATE_KBPS),
      audioBitrate: this.platformConfig.getNumber(CONFIG_KEYS.RECORDING_AUDIO_BITRATE_KBPS),
    };
  }

  /**
   * Where a room's recording lives, decided in exactly one place.
   *
   * Both the egress request and the ingest that looks for its output need this
   * path, and the two being written separately is how a recording ends up
   * uploaded to one place and searched for in another.
   */
  static recordingPrefix(roomId: string): string {
    return `recordings/${roomId}/`;
  }

  /**
   * The recording as the *store* has it, or null if it is not there yet.
   *
   * Requires a playlist and at least one segment. A playlist alone is written
   * early and names segments that may never arrive, so treating it as proof
   * would file an empty lesson as recorded — the same false claim in a new
   * place.
   *
   * The size is the sum of the folder rather than the playlist's own few
   * kilobytes, because that is what the lesson actually occupies and what the
   * storage warning has to count.
   */
  private async storedRecording(
    roomId: string,
    playlistKey: string,
  ): Promise<{ storageKey: string; durationSec: number; sizeBytes: number; segmentCount: number } | null> {
    const playlist = await this.storage.head(playlistKey);
    if (!playlist) return null;

    const objects = await this.storage.list(LiveKitService.recordingPrefix(roomId));
    const segments = objects.filter((o) => o.key.endsWith('.ts'));
    if (segments.length === 0) return null;

    return {
      storageKey: playlistKey,
      /*
       * Duration from the segments themselves.
       *
       * `segmentDuration: 6` is what egress was asked for, so the count is the
       * length. Read from the playlist's `#EXTINF` lines it would be exact, but
       * that means fetching and parsing it for a number used to label a card —
       * and the last segment being short is the whole of the error.
       */
      durationSec: segments.length * 6,
      sizeBytes: objects.reduce((total, object) => total + object.sizeBytes, 0),
      segmentCount: segments.length,
    };
  }

  /** Stops a recording when the teacher ends the lesson. */
  async stopRecording(egressId: string): Promise<void> {
    if (!this.configured) return;
    const egress = new EgressClient(this.httpUrl, this.apiKey, this.apiSecret);
    try {
      await egress.stopEgress(egressId);
    } catch (error) {
      this.logger.error(`Could not stop egress ${egressId}: ${(error as Error).message}`);
    }
  }

  /**
   * The server APIs speak HTTPS; only the client SDK uses the `wss://` form.
   *
   * Passing the WebSocket URL to `RoomServiceClient` fails with a connection
   * error that names neither the cause nor the fix, so the conversion happens
   * once, here.
   */
  private get httpUrl(): string {
    return this.url.replace(/^ws/, 'http');
  }
}
