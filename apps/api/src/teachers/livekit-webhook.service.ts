import { Injectable, Logger } from '@nestjs/common';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/http-exception.filter';

/**
 * Attendance, as the media server observed it.
 *
 * ## Why this exists at all
 *
 * `SessionParticipant.attendedMinutes` is read by the earnings pass, the ratings
 * gate and three admin reports, and until now **nothing wrote it**. Every payout
 * was weighted by zero, so no teacher could earn anything from a lesson they had
 * actually taught. The recording pipeline was finished and earnings were still
 * arithmetically impossible.
 *
 * The rule this platform has held from the beginning is that attendance comes
 * from the media server and never from self-report — a browser saying "I was
 * here for 45 minutes" is a number the person being paid for it chose. LiveKit
 * knows when each participant's connection opened and closed, so LiveKit is
 * asked.
 *
 * ## Why the signature is checked against raw bytes
 *
 * This endpoint is public: LiveKit calls it, and LiveKit has no session with us.
 * What makes that safe is the signature over the request body, verified with the
 * same API secret that mints room tokens. Anyone can POST here; only LiveKit can
 * POST something that verifies.
 *
 * The bytes must be the ones LiveKit sent. Re-serialising a parsed object gives
 * different key order and spacing, so the digest would never match — every real
 * webhook rejected, which on this endpoint means every teacher silently unpaid.
 */
@Injectable()
export class LiveKitWebhookService {
  private readonly logger = new Logger(LiveKitWebhookService.name);

  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    env: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = env.get<string>('LIVEKIT_API_KEY') ?? '';
    this.apiSecret = env.get<string>('LIVEKIT_API_SECRET') ?? '';
  }

  /**
   * Verifies and applies one webhook.
   *
   * Throws on a bad signature — a caller who cannot prove they are LiveKit is
   * refused before a single field of their payload is read, let alone written.
   */
  async handle(rawBody: Buffer | undefined, authorization: string | undefined): Promise<void> {
    if (!this.apiKey || !this.apiSecret) {
      /*
       * Not configured is not the same as forged. Saying so keeps a developer
       * without LiveKit keys from chasing a signature problem they do not have.
       */
      this.logger.warn('Webhook received but LiveKit is not configured; ignoring');
      return;
    }
    if (!rawBody || !authorization) throw AppError.forbidden('errors.live.bad_signature');

    const receiver = new WebhookReceiver(this.apiKey, this.apiSecret);

    let event: WebhookEvent;
    try {
      event = await receiver.receive(rawBody.toString('utf8'), authorization);
    } catch (error) {
      this.logger.error(`Rejected a webhook: ${(error as Error).message}`);
      throw AppError.forbidden('errors.live.bad_signature');
    }

    switch (event.event) {
      case 'participant_joined':
        await this.onJoin(event);
        break;
      case 'participant_left':
        await this.onLeave(event);
        break;
      case 'room_finished':
        await this.onRoomFinished(event);
        break;
      default:
        /*
         * Everything else is acknowledged and ignored. LiveKit adds events over
         * time and retries anything it does not get a 2xx for; refusing an event
         * we simply do not use would turn a new LiveKit feature into a retry
         * loop against this API.
         */
        break;
    }
  }

  /**
   * Opens the seat, or leaves an existing one alone.
   *
   * `firstJoinAt` is the first arrival and never moves: it is what the lesson's
   * start is measured from, and a learner who drops out and rejoins has not
   * arrived twice.
   */
  private async onJoin(event: WebhookEvent): Promise<void> {
    const seat = await this.locate(event);
    if (!seat) return;

    await this.prisma.sessionParticipant.upsert({
      where: { sessionId_userId: { sessionId: seat.sessionId, userId: seat.userId } },
      create: { sessionId: seat.sessionId, userId: seat.userId, firstJoinAt: new Date() },
      /*
       * Clearing `lastLeaveAt` is what makes "present" true again after a
       * reconnection. Without it a learner who lost signal and came back would
       * count as absent for the rest of the lesson.
       */
      update: { lastLeaveAt: null },
    });
  }

  /**
   * Closes the seat and adds the minutes actually connected.
   *
   * The duration comes from LiveKit's own `joinedAt` on the participant rather
   * than from anything stored here. That matters for a reconnection: the second
   * spell has its own `joinedAt`, so the minutes add up across drops instead of
   * being measured from a first arrival an hour earlier — which on a Cameroonian
   * connection would pay for time nobody was connected.
   */
  private async onLeave(event: WebhookEvent): Promise<void> {
    const seat = await this.locate(event);
    if (!seat) return;

    const joinedAtSeconds = Number(event.participant?.joinedAt ?? 0);
    const now = new Date();

    /*
     * Zero when LiveKit did not tell us, rather than a guess. An invented
     * duration here is an invented payment, and it would be invisible by the
     * time it reached a payslip.
     */
    const minutes =
      joinedAtSeconds > 0
        ? Math.max(0, Math.floor((now.getTime() / 1000 - joinedAtSeconds) / 60))
        : 0;

    await this.prisma.sessionParticipant.upsert({
      where: { sessionId_userId: { sessionId: seat.sessionId, userId: seat.userId } },
      create: {
        sessionId: seat.sessionId,
        userId: seat.userId,
        firstJoinAt: joinedAtSeconds > 0 ? new Date(joinedAtSeconds * 1000) : now,
        lastLeaveAt: now,
        attendedMinutes: minutes,
      },
      update: {
        lastLeaveAt: now,
        /* Accumulated, because a lesson can be joined more than once. */
        attendedMinutes: { increment: minutes },
      },
    });

    this.logger.log(
      `${seat.userId} left ${seat.sessionId} after ${minutes} min (total recorded on the seat)`,
    );
  }

  /**
   * Closes any seat still open when the room ends.
   *
   * LiveKit normally sends `participant_left` for everyone first, so this is the
   * exception path — a room torn down under a participant whose leave event was
   * lost. Their minutes are not guessed: the seat is marked closed so nobody
   * shows as permanently present, and the time goes unrecorded rather than
   * invented.
   */
  private async onRoomFinished(event: WebhookEvent): Promise<void> {
    const roomName = event.room?.name;
    if (!roomName) return;

    const session = await this.prisma.session.findFirst({
      where: { roomId: roomName },
      select: { id: true },
    });
    if (!session) return;

    const closed = await this.prisma.sessionParticipant.updateMany({
      where: { sessionId: session.id, lastLeaveAt: null },
      data: { lastLeaveAt: new Date() },
    });
    if (closed.count > 0) {
      this.logger.warn(
        `Room ${roomName} finished with ${closed.count} seat(s) still open; closed without adding minutes`,
      );
    }
  }

  /**
   * The session and user this event is about, or null.
   *
   * Null is ordinary: LiveKit rooms can outlive a session row, and an egress
   * worker joins rooms as a participant too. Neither is an error worth a log
   * line on every lesson.
   */
  private async locate(
    event: WebhookEvent,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const roomName = event.room?.name;
    const identity = event.participant?.identity;
    if (!roomName || !identity) return null;

    /*
     * The identity is the platform's user id, set when the token was minted. A
     * value that is not a uuid is not ours — LiveKit's own egress participant,
     * most often — and is skipped before it reaches a query.
     */
    if (!/^[0-9a-f-]{36}$/i.test(identity)) return null;

    const session = await this.prisma.session.findFirst({
      where: { roomId: roomName },
      select: { id: true },
    });
    if (!session) return null;

    return { sessionId: session.id, userId: identity };
  }
}
