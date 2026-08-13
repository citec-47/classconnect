import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
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

    return { url: this.url, token: await token.toJwt() };
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
        }),
      );
      return info.egressId ?? null;
    } catch (error) {
      this.logger.error(`Could not start recording ${roomId}: ${(error as Error).message}`);
      return null;
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
