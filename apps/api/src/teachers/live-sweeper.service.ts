import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LiveKitService } from './livekit.service';

/**
 * Closes lessons nobody closed.
 *
 * A session ends when the teacher presses End. Browsers close, phones lose
 * signal and laptops run out of battery, so some lessons are never ended by
 * anybody — and one was found still `in_progress` 78 minutes after a scheduled
 * 60-minute class, with its participant seat still open.
 *
 * Left alone that is not merely untidy. An open session:
 *
 *   · blocks the teacher from going live again (`already_live`);
 *   · keeps a seat open, so the register says a child is still in a room;
 *   · leaves a LiveKit egress recording an empty room, and billing for it.
 *
 * ## Why the grace period is generous
 *
 * A lesson legitimately overruns. Closing at exactly `durationMin` would end
 * classes that are still being taught, which is far worse than a session that
 * lingers an extra half hour — so the sweep waits until the scheduled end plus
 * a margin, and only then treats the room as abandoned.
 *
 * Mirrors `BillingSchedulerService`: a timer in a long-running process, off in
 * tests and off on serverless, where the same work belongs to Cron.
 */
@Injectable()
export class LiveSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveSweeperService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  /** How long past a lesson's scheduled end before it is considered abandoned. */
  private static readonly GRACE_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly livekit: LiveKitService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || process.env.CC_DISABLE_SCHEDULERS === 'true') return;
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      this.logger.log('Serverless runtime detected: the live sweep runs from Cron, not a timer');
      return;
    }

    // Every ten minutes. A lesson already past its grace period is not urgent,
    // but leaving one open for an hour after that is what this exists to stop.
    this.timer = setInterval(() => void this.runSafely(), 10 * 60 * 1000);
    this.timer.unref();
    void this.runSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const closed = await this.closeAbandoned();
      if (closed > 0) this.logger.warn(`Closed ${closed} abandoned live session(s)`);
    } catch (error) {
      // A sweep that throws must not take the API down with it.
      this.logger.error(`Live sweep failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Ends every session that is past its scheduled end plus the grace period.
   *
   * Marked `completed` rather than `cancelled`: the lesson did happen, and
   * whatever attendance the media server recorded stands. What is being
   * corrected is only that nobody pressed the button.
   */
  async closeAbandoned(): Promise<number> {
    const open = await this.prisma.session.findMany({
      where: { status: 'in_progress' },
      select: { id: true, teacherId: true, startsAtUtc: true, durationMin: true, egressId: true },
    });

    const now = Date.now();
    const abandoned = open.filter((session) => {
      const scheduledEnd =
        session.startsAtUtc.getTime() + session.durationMin * 60_000;
      return now > scheduledEnd + LiveSweeperService.GRACE_MINUTES * 60_000;
    });

    for (const session of abandoned) {
      // Stop the recording first, for the same reason `endLive` does.
      if (session.egressId) await this.livekit.stopRecording(session.egressId);

      const endedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.session.update({
          where: { id: session.id },
          data: { status: 'completed', endedAt },
        }),
        this.prisma.sessionParticipant.updateMany({
          where: { sessionId: session.id, lastLeaveAt: null },
          data: { lastLeaveAt: endedAt },
        }),
      ]);

      /*
       * Attributed to the teacher, and flagged as automatic.
       *
       * Somebody reading the trail later needs to know this lesson was closed
       * by the platform rather than by the person teaching it — the difference
       * matters if the minutes are ever disputed.
       */
      await this.audit.record({
        action: 'live.ended',
        entity: 'session',
        entityId: session.id,
        actorId: session.teacherId,
        after: {
          closedAutomatically: true,
          reason: 'abandoned',
          scheduledMinutes: session.durationMin,
        },
      });
    }

    return abandoned.length;
  }
}
