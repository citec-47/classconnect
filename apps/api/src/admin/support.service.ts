import { Injectable } from '@nestjs/common';
import type { TicketCategory } from '@prisma/client';
import { CONFIG_KEYS, hasPermission, type Role } from '@classconnect/shared';
import { PrismaService } from '../common/prisma.service';
import { PlatformConfigService } from '../common/platform-config.service';
import { AppError } from '../common/http-exception.filter';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * §4.5 — routing the support queue (FR-SUP-001..007).
 *
 * Two routing rules are absolute and are enforced by the query rather than by a
 * filter the caller can forget:
 *
 *   FR-SUP-007 / FR-SAF-006 — safeguarding tickets never appear in the general
 *   pool. `excludeRestricted` is applied to every list this service returns.
 *
 *   FR-SUP-007 — payment disputes route to a dedicated finance queue.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PlatformConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The general pool never contains a safeguarding ticket. Written as a `where`
   * fragment reused by every listing, so a new listing cannot leak them by
   * omission.
   */
  private readonly generalPool = { category: { not: 'safeguarding' as TicketCategory } };

  /** FR-SUP-006: SLA deadlines, stamped at creation and read here. */
  private slaFor(ticket: { firstResponseDueAt: Date | null; firstResponseAt: Date | null }) {
    const now = Date.now();
    if (!ticket.firstResponseDueAt) return { minutesRemaining: null, breached: false };
    if (ticket.firstResponseAt) {
      return {
        minutesRemaining: null,
        breached: ticket.firstResponseAt > ticket.firstResponseDueAt,
      };
    }
    return {
      minutesRemaining: Math.round((ticket.firstResponseDueAt.getTime() - now) / 60_000),
      breached: ticket.firstResponseDueAt.getTime() < now,
    };
  }

  /**
   * §4.5: the unassigned queue.
   *
   * `scope` reflects §3's role table: an agent sees their own queue, a routing
   * admin sees everything unassigned. The distinction is enforced by the caller's
   * permissions, checked at the controller and reasserted here.
   */
  async queue(input: { actorId: string; roles: Role[]; scope: 'unassigned' | 'mine' }) {
    const canRouteAll = hasPermission(input.roles, 'support:read:any');
    if (input.scope === 'unassigned' && !canRouteAll) {
      throw AppError.forbidden();
    }

    const tickets = await this.prisma.ticket.findMany({
      where: {
        ...this.generalPool,
        status: { in: ['open', 'in_progress', 'waiting_on_user'] },
        ...(input.scope === 'mine'
          ? { assigneeId: input.actorId }
          : { assigneeId: null }),
      },
      include: {
        requester: {
          select: { id: true, fullName: true, phoneE164: true, roles: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const now = Date.now();
    const windowHours = this.config.getNumber(CONFIG_KEYS.WHATSAPP_SERVICE_WINDOW_HOURS);

    return tickets.map((ticket) => ({
      id: ticket.id,
      channel: ticket.channel,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      subject: ticket.subject,
      requester: {
        id: ticket.requester.id,
        fullName: ticket.requester.fullName,
        phone: ticket.requester.phoneE164,
        roles: ticket.requester.roles.map((r) => r.role),
      },
      createdAt: ticket.createdAt,
      ageMinutes: Math.floor((now - ticket.createdAt.getTime()) / 60_000),
      assigneeId: ticket.assigneeId,
      sla: this.slaFor(ticket),
      // FR-SUP-007: shown so an operator understands why a dispute is routed
      // away from them rather than finding it missing.
      routedTo:
        ticket.category === 'payment_dispute' ? ('finance' as const) : ('general' as const),
      // FR-NOT-007 / R7: the composer needs the remaining window, and the reply
      // rules differ once it closes.
      whatsapp:
        ticket.channel === 'whatsapp'
          ? {
              windowEndsAt: ticket.whatsappWindowEndsAt,
              open: Boolean(
                ticket.whatsappWindowEndsAt && ticket.whatsappWindowEndsAt.getTime() > now,
              ),
              windowHours,
              minutesRemaining: ticket.whatsappWindowEndsAt
                ? Math.max(
                    0,
                    Math.round((ticket.whatsappWindowEndsAt.getTime() - now) / 60_000),
                  )
                : 0,
            }
          : null,
    }));
  }

  /**
   * §4.5: the agent panel — open tickets, tickets waiting on the user, average
   * first-response time, and presence.
   */
  async agents() {
    const agents = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { in: ['support_agent', 'admin_ops', 'super_admin'] } } },
        status: 'active',
      },
      select: { id: true, fullName: true, roles: { select: { role: true } } },
    });

    const profiles = await this.prisma.supportAgentProfile.findMany({
      where: { userId: { in: agents.map((a) => a.id) } },
    });
    const profileFor = new Map(profiles.map((p) => [p.userId, p]));

    return Promise.all(
      agents.map(async (agent) => {
        const [open, waiting, responded] = await Promise.all([
          this.prisma.ticket.count({
            where: { assigneeId: agent.id, status: { in: ['open', 'in_progress'] } },
          }),
          this.prisma.ticket.count({
            where: { assigneeId: agent.id, status: 'waiting_on_user' },
          }),
          this.prisma.ticket.findMany({
            where: { assigneeId: agent.id, firstResponseAt: { not: null } },
            select: { createdAt: true, firstResponseAt: true },
            take: 100,
            orderBy: { createdAt: 'desc' },
          }),
        ]);

        const averageFirstResponseMinutes =
          responded.length === 0
            ? null
            : Math.round(
                responded.reduce(
                  (sum, t) =>
                    sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60_000,
                  0,
                ) / responded.length,
              );

        const profile = profileFor.get(agent.id);

        return {
          id: agent.id,
          fullName: agent.fullName,
          roles: agent.roles.map((r) => r.role),
          openTickets: open,
          waitingOnUser: waiting,
          averageFirstResponseMinutes,
          presence: profile?.presence ?? 'offline',
          lastSeenAt: profile?.lastSeenAt ?? null,
          maxOpenTickets: profile?.maxOpenTickets ?? 25,
          safeguardingDesignated: profile?.safeguardingDesignated ?? false,
        };
      }),
    );
  }

  /**
   * FR-SUP-004: the context that travels with a ticket.
   *
   * "Do not make an agent go hunting." Everything the brief lists is fetched
   * here in one call, including the freeze state, because "why can't my child
   * join the lesson" is the single most common reason this screen is open.
   */
  async context(ticketId: string, actorId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        requester: {
          include: {
            roles: true,
            guardianProfile: {
              include: {
                learners: {
                  include: {
                    learner: {
                      include: {
                        freezes: { where: { liftedAt: null } },
                        subscriptions: {
                          include: { plan: true, schedule: { include: { instalments: true } } },
                          orderBy: { createdAt: 'desc' },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw AppError.notFound();

    // FR-SAF-006: a safeguarding ticket's context is not readable from the
    // general support screen, whatever id is passed to it.
    if (ticket.category === 'safeguarding') {
      const profile = await this.prisma.supportAgentProfile.findUnique({
        where: { userId: actorId },
        select: { safeguardingDesignated: true },
      });
      if (!profile?.safeguardingDesignated) {
        throw AppError.forbidden('errors.safeguarding.not_designated');
      }
    }

    const learners =
      ticket.requester.guardianProfile?.learners.map((link) => link.learner) ?? [];

    const [recentPayments, recentSessions] = await Promise.all([
      this.prisma.payment.findMany({
        where: { subscription: { learnerId: { in: learners.map((l) => l.id) } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amountXaf: true,
          method: true,
          status: true,
          createdAt: true,
          failureReason: true,
        },
      }),
      this.prisma.session.findMany({
        where: { learnerId: { in: learners.map((l) => l.id) } },
        orderBy: { startsAtUtc: 'desc' },
        take: 5,
        select: { id: true, startsAtUtc: true, status: true, type: true },
      }),
    ]);

    // FR-RBA-004: the agent is reading a learner's personal data.
    for (const learner of learners) {
      await this.audit.recordLearnerAccess(actorId, learner.id);
    }

    return {
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        channel: ticket.channel,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        sla: this.slaFor(ticket),
      },
      user: {
        id: ticket.requester.id,
        fullName: ticket.requester.fullName,
        phone: ticket.requester.phoneE164,
        email: ticket.requester.email,
        roles: ticket.requester.roles.map((r) => r.role),
        status: ticket.requester.status,
      },
      learners: learners.map((learner) => {
        const subscription = learner.subscriptions[0];
        const outstanding = (subscription?.schedule?.instalments ?? [])
          .filter((i) => i.state !== 'paid' && i.state !== 'cancelled')
          .reduce((sum, i) => sum + i.amountXaf, 0n);
        const manual = learner.freezes.find((f) => f.kind === 'manual');
        const automatic = learner.freezes.find((f) => f.kind === 'automatic');

        return {
          id: learner.id,
          fullName: learner.fullName,
          subscription: subscription
            ? {
                plan: subscription.plan.code,
                status: subscription.status,
                periodEnd: subscription.periodEnd,
              }
            : null,
          outstandingXaf: outstanding.toString(),
          // The answer to the commonest question, on the first screen.
          freeze: learner.freezes.length
            ? {
                kind: manual ? 'manual' : 'automatic',
                reason: manual?.reason ?? automatic?.reason ?? null,
                liftableByPayment: Boolean(automatic) && !manual,
              }
            : null,
        };
      }),
      recentPayments: recentPayments.map((p) => ({
        ...p,
        amountXaf: p.amountXaf.toString(),
      })),
      recentSessions,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        authorId: m.authorId,
        body: m.body,
        internal: m.internal,
        createdAt: m.createdAt,
      })),
    };
  }

  /** §4.5: assign one or many tickets to an agent. Each writes an audit entry. */
  async assign(input: { ticketIds: string[]; agentId: string; actorId: string }) {
    const agent = await this.prisma.user.findFirst({
      where: {
        id: input.agentId,
        roles: { some: { role: { in: ['support_agent', 'admin_ops', 'super_admin'] } } },
      },
      select: { id: true, fullName: true },
    });
    if (!agent) throw AppError.badRequest('errors.support.agent_not_found');

    const tickets = await this.prisma.ticket.findMany({
      where: { id: { in: input.ticketIds } },
      select: { id: true, assigneeId: true, category: true, subject: true },
    });

    // FR-SUP-007: a safeguarding ticket is not routed from this screen.
    const restricted = tickets.filter((t) => t.category === 'safeguarding');
    if (restricted.length > 0) throw AppError.forbidden('errors.safeguarding.not_designated');

    const now = new Date();
    const firstResponseHours = this.config.getNumber(CONFIG_KEYS.SUPPORT_FIRST_RESPONSE_HOURS);
    const resolutionHours = this.config.getNumber(CONFIG_KEYS.SUPPORT_RESOLUTION_HOURS);

    await this.prisma.ticket.updateMany({
      where: { id: { in: tickets.map((t) => t.id) } },
      data: {
        assigneeId: input.agentId,
        assignedBy: input.actorId,
        assignedAt: now,
        status: 'in_progress',
      },
    });

    // FR-SUP-006: an unassigned ticket has no clock. Assignment starts it, and
    // the deadline is stamped so a later configuration change cannot move it.
    await this.prisma.ticket.updateMany({
      where: { id: { in: tickets.map((t) => t.id) }, firstResponseDueAt: null },
      data: {
        firstResponseDueAt: new Date(now.getTime() + firstResponseHours * 3_600_000),
        resolutionDueAt: new Date(now.getTime() + resolutionHours * 3_600_000),
      },
    });

    for (const ticket of tickets) {
      await this.audit.record({
        action: ticket.assigneeId ? 'ticket.reassigned' : 'ticket.assigned',
        entity: 'ticket',
        entityId: ticket.id,
        actorId: input.actorId,
        before: { assigneeId: ticket.assigneeId },
        after: { assigneeId: input.agentId },
      });
    }

    await this.notifications.notifyUser(
      input.agentId,
      'ticketAssigned',
      { count: tickets.length },
      { dedupeKey: `assign:${input.agentId}:${now.toISOString()}` },
    );

    return { assigned: tickets.length, agent: agent.fullName };
  }

  /** FR-SUP-006: escalation on breach, and by hand when an agent needs help. */
  async escalate(input: { ticketId: string; reason: string; actorId: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw AppError.notFound();

    await this.prisma.ticket.update({
      where: { id: input.ticketId },
      data: { priority: 'urgent', escalatedAt: new Date() },
    });

    await this.audit.record({
      action: 'ticket.escalated',
      entity: 'ticket',
      entityId: input.ticketId,
      actorId: input.actorId,
      before: { priority: ticket.priority },
      after: { priority: 'urgent' },
      reason: input.reason,
    });

    return { escalated: true };
  }

  /**
   * FR-NOT-007 / R7: outside the 24-hour customer-service window a WhatsApp
   * reply must use a pre-approved template. Refused here rather than left to the
   * composer, because the penalty for getting it wrong is Meta's, not ours.
   */
  async assertWhatsappReplyAllowed(ticketId: string, usingTemplate: boolean): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { channel: true, whatsappWindowEndsAt: true },
    });
    if (!ticket || ticket.channel !== 'whatsapp') return;

    const open = Boolean(
      ticket.whatsappWindowEndsAt && ticket.whatsappWindowEndsAt.getTime() > Date.now(),
    );
    if (!open && !usingTemplate) {
      throw AppError.badRequest('errors.support.whatsapp_window_closed');
    }
  }

  /** §3: the unassigned badge — general pool only, never safeguarding. */
  async unassignedCount(): Promise<number> {
    return this.prisma.ticket.count({
      where: {
        ...this.generalPool,
        assigneeId: null,
        status: { in: ['open', 'in_progress'] },
      },
    });
  }

  /** §4.1: SLA attainment for the operational row. */
  async slaAttainment(since: Date): Promise<number | null> {
    const tickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: since }, firstResponseDueAt: { not: null } },
      select: { firstResponseAt: true, firstResponseDueAt: true },
    });
    if (tickets.length === 0) return null;

    const met = tickets.filter(
      (t) => t.firstResponseAt && t.firstResponseAt <= t.firstResponseDueAt!,
    ).length;
    return Math.round((met / tickets.length) * 100);
  }
}
