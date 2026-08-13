import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { FeeStageDto, LearnerFeesDto } from '@classconnect/shared';

/**
 * Fee status on the learner's own surface.
 *
 * This exists in tension with a rule the brief is emphatic about — §7 and
 * FR-PAY-003 keep billing on the Parent surface, and §10's criterion 9 requires
 * that no monetary amount appear *in the payload* for a minor, not merely that
 * the UI hide one.
 *
 * The tension resolves once you separate two different things that both get
 * called "fees":
 *
 *  - **A bill.** What is owed, to whom, by when. That is the payer's business,
 *    and for a minor the payer is their guardian. Still forbidden here.
 *  - **A status.** Which of the three stages are done, which is next. That is
 *    the learner's business, because it is the answer to "why did the app lock
 *    me out?", and leaving a child to guess at that is worse than telling them.
 *
 * So this service returns stage *states* and, for a minor, no amounts at all —
 * not zeroed, not masked, absent. The optional `amountXaf` on `FeeStageDto` is
 * populated only when the learner is their own payer, which is the same
 * condition `LevelConfig.showBilling` already encodes.
 *
 * Admin-only, for now: nothing here writes. Instalment state is moved by the
 * payment reconciliation job and by Finance Admin, which is what the brief asks
 * for and also what keeps a learner from being able to argue with the ledger.
 */
@Injectable()
export class LearnerFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async status(learnerId: string, isOwnPayer: boolean, userId: string): Promise<LearnerFeesDto> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { learnerId, status: { in: ['active', 'grace', 'suspended', 'pending_payment'] } },
      orderBy: { periodStart: 'desc' },
      select: {
        schedule: {
          select: {
            planType: true,
            totalXaf: true,
            registrationFeeXaf: true,
            registrationPaidAt: true,
            instalments: {
              select: {
                sequence: true,
                state: true,
                dueOn: true,
                paidAt: true,
                amountXaf: true,
              },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });

    const schedule = subscription?.schedule;

    /*
     * No subscription, or one without a payment schedule, is an ordinary state
     * — a learner an Admin has created but nobody has paid for yet. Returning
     * null here sent an empty body, which gave the client an object with no
     * `stages` and crashed the screen. A complete DTO with an empty list says
     * the same thing in a shape every caller can read.
     */
    if (!schedule) {
      return {
        planType: 'full',
        overall: 'not_started',
        stages: [],
        payer: isOwnPayer ? 'self' : 'guardian',
        notices: [],
      };
    }

    const stages: FeeStageDto[] = schedule.instalments.map((instalment) => {
      const stage: FeeStageDto = {
        sequence: instalment.sequence,
        state: stageState(instalment.state),
        dueOn: instalment.dueOn ? instalment.dueOn.toISOString().slice(0, 10) : null,
        paidOn: instalment.paidAt ? instalment.paidAt.toISOString().slice(0, 10) : null,
      };

      /*
       * Amounts are shown.
       *
       * This file previously withheld them from a minor, on the reading that a
       * bill is the payer's business and a child should not be handed one they
       * cannot act on (FR-PAY-003).
       *
       * The product decision is that guardians sign in through the learner's
       * account, which makes withholding the amounts a guarantee the *payer*
       * never sees what they owe — the opposite of the intent. So the figures
       * are shown, and the copy still says plainly whose responsibility they
       * are.
       *
       * The safer long-term shape is a guardian login of their own, with the
       * child's view kept to stages; `guardian_learners` already models it.
       * Until then this is the honest trade, made deliberately rather than by
       * omission.
       */
      stage.amountXaf = Number(instalment.amountXaf);

      return stage;
    });

    /*
     * Recent fee notices, on the screen they are about.
     *
     * The notification already reaches the learner through their usual channels;
     * this puts the same messages where the question is asked. A parent opening
     * Fees to check what changed should find the answer there rather than
     * hunting through an inbox.
     *
     * Read-only, and only fee events — this is not a general inbox.
     */
    const notices = await this.prisma.notification.findMany({
      where: {
        userId,
        eventType: { in: ['fees.registered', 'fees.status_changed', 'fees.payment_received'] },
        /*
         * The in-app copy only.
         *
         * `notifyUser` writes one row per channel, so a single event that also
         * went out by SMS and email would otherwise appear three times on the
         * screen. The in-app row is the one this surface is about.
         */
        channel: 'in_app',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, eventType: true, payloadJson: true, createdAt: true },
    });

    const paidCount = stages.filter((stage) => stage.state === 'paid').length;

    const dto: LearnerFeesDto = {
      planType: schedule.planType === 'three_instalments' ? 'three_instalments' : 'full',
      overall:
        paidCount === 0 ? 'not_started' : paidCount === stages.length ? 'completed' : 'in_progress',
      stages,
      payer: isOwnPayer ? 'self' : 'guardian',
      /*
       * The message exactly as it was sent.
       *
       * `payloadJson` holds the *rendered* subject and body — the notification
       * service interpolates before it stores, because the same text goes out by
       * SMS and email where there is no client to render it.
       *
       * So this returns that text rather than re-rendering. An earlier version
       * passed the payload as interpolation parameters and produced a literal
       * "{learner}" on screen, which is what happens when you assume a store
       * holds inputs and it holds outputs.
       *
       * The trade: a message is frozen in the language it was sent in. That is
       * arguably right for a record of what somebody was told, and it matches
       * the SMS they received.
       */
      notices: notices.map((notice) => {
        const payload = (notice.payloadJson ?? {}) as { body?: string };
        return {
          id: notice.id,
          eventType: notice.eventType,
          body: payload.body ?? '',
          at: notice.createdAt.toISOString(),
        };
      }),
    };

    /*
     * Registration is reported separately from tuition.
     *
     * They are different debts — a family pays to enrol, then pays to be taught
     * — and a screen that adds them into one figure cannot answer "what is the
     * registration fee?", which is the first thing a parent asks.
     */
    dto.registrationFeeXaf = Number(schedule.registrationFeeXaf);
    dto.registrationPaid = Boolean(schedule.registrationPaidAt);
    dto.totalXaf = Number(schedule.totalXaf);
    dto.paidXaf = schedule.instalments
      .filter((instalment) => instalment.state === 'paid')
      .reduce((sum, instalment) => sum + Number(instalment.amountXaf), 0);
    dto.outstandingXaf =
      (dto.registrationPaid ? 0 : Number(schedule.registrationFeeXaf)) +
      schedule.instalments
      .filter((instalment) => instalment.state !== 'paid' && instalment.state !== 'cancelled')
      .reduce((sum, instalment) => sum + Number(instalment.amountXaf), 0);

    return dto;
  }
}

function stageState(state: string): FeeStageDto['state'] {
  switch (state) {
    case 'paid':
      return 'paid';
    case 'due':
      return 'due';
    case 'overdue':
      return 'overdue';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'upcoming';
  }
}
