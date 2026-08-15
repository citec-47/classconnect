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
} from 'livekit-server-sdk';
import { AppError } from '../common/http-exception.filter';

/** What a participant may do once they are in the room. */
export interface RoomGrant {
  /** The LiveKit room, which is `Session.roomId`. */
  roomId: string;
  /** Stable across reconnects, so a rejoin replaces rather than duplicates. */
  identity: string;
  displayName: string;
  /**
   * May this participant send audio and video?
   *
   * The teacher always can. A learner cannot until the teacher grants them the
   * floor — FR-LIV: the class listens, and speaks when chosen. Enforced here in
   * the token rather than by hiding a button, because a hidden button is not an
   * access control: the grant is signed and the media server refuses anything
   * the token does not carry.
   */
  canPublish: boolean;
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

  constructor(env: ConfigService) {
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
  async setCanPublish(roomId: string, identity: string, canPublish: boolean): Promise<void> {
    if (!this.configured) return;

    const rooms = new RoomServiceClient(this.httpUrl, this.apiKey, this.apiSecret);
    try {
      await rooms.updateParticipant(roomId, identity, undefined, {
        canPublish,
        canSubscribe: true,
        canPublishData: true,
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
            filenamePrefix: `recordings/${roomId}/segment`,
            playlistName: `recordings/${roomId}/index.m3u8`,
            segmentDuration: 6,
            output: { case: 's3', value: storage },
          }),
        },
        {
          /*
           * 480×360 at 500 kbps, 15fps, audio at 64 kbps.
           *
           * Chosen for the network the lesson is watched on, not the one it is
           * recorded on: students here are on mobile data, and a sharper video
           * they cannot afford to load is worse than a legible one they can. It
           * also brings a 45-minute lesson to roughly 200 MB rather than a
           * gigabyte, which is what makes a 1 GB bucket hold more than one.
           *
           * Audio bitrate is kept ahead of what the picture gets proportionally
           * — a lesson survives a blurry diagram far better than it survives a
           * teacher who cannot be understood.
           */
          encodingOptions: new EncodingOptions({
            width: 480,
            height: 360,
            framerate: 15,
            videoBitrate: 500,
            audioBitrate: 64,
          }),
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
  ): Promise<{ storageKey: string; durationSec: number; sizeBytes: number; segmentCount: number } | null> {
    if (!this.configured) return null;

    const egress = new EgressClient(this.httpUrl, this.apiKey, this.apiSecret);

    /*
     * Six attempts, five seconds apart. Composing and uploading a lesson takes
     * longer than stopping it does, and giving up immediately would file every
     * recording as failed while the file was still being written.
     */
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const [info] = await egress.listEgress({ egressId });

        /*
         * The playlist, not a file.
         *
         * Segmented egress writes many small objects and one `.m3u8` naming
         * them in order. That playlist is the recording as far as the rest of
         * the platform is concerned: it is what gets signed, what the player
         * opens, and what a size is reported against. The segments themselves
         * are reached through it and never listed individually.
         */
        const segments = info?.segmentResults?.[0];
        if (segments?.playlistName && Number(segments.size ?? 0) > 0) {
          return {
            storageKey: segments.playlistName,
            /* LiveKit reports nanoseconds; the column is seconds. */
            durationSec: Math.round(Number(segments.duration ?? 0) / 1_000_000_000),
            sizeBytes: Number(segments.size),
            segmentCount: segments.segmentCount ? Number(segments.segmentCount) : 0,
          };
        }

        /* A single-file egress from before the switch still reports this way. */
        const file = info?.fileResults?.[0];
        if (file?.filename && Number(file.size ?? 0) > 0) {
          return {
            storageKey: file.filename,
            durationSec: Math.round(Number(file.duration ?? 0) / 1_000_000_000),
            sizeBytes: Number(file.size),
            segmentCount: 0,
          };
        }

        /* Terminal and empty-handed: no amount of waiting will produce a file. */
        if (info && ['EGRESS_FAILED', 'EGRESS_ABORTED'].includes(String(info.status))) {
          this.logger.error(`Egress ${egressId} ended as ${info.status}: ${info.error ?? ''}`);
          return null;
        }
      } catch (error) {
        this.logger.error(`Could not read egress ${egressId}: ${(error as Error).message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }

    this.logger.error(`Egress ${egressId} produced no file within 30s`);
    return null;
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
