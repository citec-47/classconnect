import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
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
   * Starts recording the room to Cloudinary-compatible storage.
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
      const info = await egress.startRoomCompositeEgress(
        roomId,
        new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: `recordings/${roomId}.mp4`,
          output: { case: 's3', value: storage },
        }),
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
