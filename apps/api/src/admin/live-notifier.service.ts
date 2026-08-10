import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LiveService } from './live.service';
import { BadgesGateway } from './badges.gateway';

/**
 * Tells connected admins when a lesson starts.
 *
 * The brief asks that "the admin should always be notified when a particular
 * class is going on". A lesson begins when a teacher joins the room, which is a
 * media-server event rather than an admin action — so nothing in the request
 * path knows it happened, and something has to notice.
 *
 * This watches for sessions that have entered `in_progress` since the last look
 * and pushes an announcement to every connected admin.
 *
 * ## Why a poll rather than a hook
 *
 * SI-005 puts session state on the media server. When its webhook lands, the
 * handler that marks a session `in_progress` should call `announce()` directly
 * and this becomes a safety net rather than the mechanism. Until that
 * integration exists, a short poll is the honest way to make the feature work
 * now — and keeping it means a missed webhook produces a late notification
 * rather than none.
 *
 * The interval is deliberately short. A notification about a lesson is only
 * useful while the lesson is happening.
 */
@Injectable()
export class LiveNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveNotifierService.name);
  private timer?: NodeJS.Timeout;

  /**
   * Sessions already announced.
   *
   * In memory, and that is the right trade: the cost of forgetting is one
   * duplicate notification after a restart, and the cost of persisting it is a
   * table written every fifteen seconds for a fact that stops mattering when
   * the lesson ends. Pruned to what is currently live, so it cannot grow.
   */
  private announced = new Set<string>();

  constructor(
    private readonly live: LiveService,
    private readonly badges: BadgesGateway,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || process.env.CC_DISABLE_SCHEDULERS === 'true') return;

    // Serverless cannot hold either a timer or the socket this pushes down, so
    // there is nothing to run there. The admin screen's own poll covers it.
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return;

    this.timer = setInterval(() => this.tick(), 15_000);
    this.timer.unref();
    this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private tick(): void {
    void this.checkForNewLessons().catch((error: unknown) => {
      // A background timer has nobody to answer, and an unhandled rejection
      // terminates the process. A missed notification must not take the API
      // down with it.
      this.logger.warn({
        msg: 'Live lesson check failed',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async checkForNewLessons(): Promise<void> {
    const liveIds = await this.live.liveSessionIds();
    const liveSet = new Set(liveIds);

    // Forget lessons that have ended, so a room reused later is announced again
    // and the set stays bounded by what is actually happening.
    for (const id of this.announced) {
      if (!liveSet.has(id)) this.announced.delete(id);
    }

    const fresh = liveIds.filter((id) => !this.announced.has(id));
    if (fresh.length === 0) {
      // The badge still moves when a lesson *ends*, which no announcement covers.
      if (liveIds.length !== this.lastCount) {
        this.lastCount = liveIds.length;
        await this.badges.broadcast();
      }
      return;
    }

    for (const sessionId of fresh) {
      this.announced.add(sessionId);
      const announcement = await this.live.announcement(sessionId);
      if (!announcement) continue;

      this.badges.announce({ type: 'live.started', ...announcement });

      this.logger.log({
        msg: 'Lesson started',
        sessionId,
        teacher: announcement.teacherName,
        private: announcement.isPrivate,
        recording: announcement.recordingEnabled,
      });
    }

    this.lastCount = liveIds.length;
    // Move the live badge at the same time, so the count and the toast agree.
    await this.badges.broadcast();
  }

  private lastCount = -1;

  /**
   * Announce immediately, for the media-server webhook to call when it lands.
   *
   * Public so that the moment SI-005 is integrated, the notification stops
   * waiting for the next poll and the poll becomes redundant without any of
   * this having to be rewritten.
   */
  async announce(sessionId: string): Promise<void> {
    if (this.announced.has(sessionId)) return;
    this.announced.add(sessionId);

    const announcement = await this.live.announcement(sessionId);
    if (!announcement) return;

    this.badges.announce({ type: 'live.started', ...announcement });
    await this.badges.broadcast();
  }
}
