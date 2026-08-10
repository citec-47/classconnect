import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { AuthenticatedUser } from '../rbac/decorators';
import {
  isMinor,
  levelFromCatalogue,
  type Language,
  type LearnerLevel,
} from '@classconnect/shared';

/**
 * The learner's own record — the payload the whole student surface hangs off.
 *
 * FR-RBA-003: a learner reads their own records and nobody else's. There is no
 * `:id` form of this endpoint on purpose. An identifier in the URL is a thing
 * someone can change, and the only correct answer to "show me learner X" on this
 * surface is "you are not learner X" — so the question is never asked.
 */

/**
 * §6 / §10 criterion 9, modelled so the prohibition survives serialisation.
 *
 * The guardian-payer variant has no amount field. Criterion 9 asks for no
 * monetary amount "anywhere in the response payload, not merely hidden in the
 * UI", and the reliable way to guarantee that is for the branch that builds a
 * minor's response to have no number in scope to put there.
 */
export type LearnerFreezeDto =
  | { active: false }
  | { active: true; payer: 'guardian' }
  | { active: true; payer: 'self'; amountOutstandingXaf: number };

export interface LearnerMeDto {
  id: string;
  /**
   * FR-SAF-007: a minor's full name is visible only to linked guardians,
   * assigned teachers and authorised staff. This is the learner's own session,
   * so their own name is theirs to see — but it is the *first* name only, so a
   * screenshot of a shared family phone does not carry a child's full identity.
   */
  displayName: string;
  level: LearnerLevel;
  /** The catalogue's label for the learner's class, already localised. */
  levelLabel: string;
  targetExamDate: string | null;
  freeze: LearnerFreezeDto;
}

/**
 * What every other learner service needs before it can answer anything: which
 * learner this is, which surface they are on, and which language to resolve the
 * bilingual catalogue into.
 *
 * Resolved once per request from the authenticated user. Passing the learner id
 * down from here rather than accepting one as a parameter is what keeps
 * FR-RBA-003 true through four services that never check it themselves.
 */
export interface LearnerContext {
  id: string;
  level: LearnerLevel;
  /** The catalogue row, for the queries that filter by it. */
  levelId: string | null;
  language: Language;
  targetExamDate: string | null;
}

@Injectable()
export class LearnerService {
  constructor(private readonly prisma: PrismaService) {}

  async context(user: AuthenticatedUser): Promise<LearnerContext> {
    const learner = await this.prisma.learner.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        levelId: true,
        archivedAt: true,
        targetExamDate: true,
        preferredLanguage: true,
        level: { select: { code: true, category: true } },
      },
    });

    if (!learner || learner.archivedAt) {
      throw new NotFoundException({ messageKey: 'errors.learner.not_found' });
    }

    return {
      id: learner.id,
      level: resolveLevel(learner.level),
      levelId: learner.levelId,
      // NFR-LOC-003: the session's language wins over the stored preference —
      // it is what the learner chose on the switcher a moment ago.
      language: user.preferredLanguage ?? learner.preferredLanguage,
      targetExamDate: learner.targetExamDate
        ? learner.targetExamDate.toISOString().slice(0, 10)
        : null,
    };
  }

  async me(user: AuthenticatedUser): Promise<LearnerMeDto> {
    const learner = await this.prisma.learner.findUnique({
      where: { userId: user.id },
      include: { level: true },
    });

    /*
     * NFR-USA-004: a learner role with no learner row is a provisioning fault,
     * not a permissions one. 404 rather than 403 keeps that distinction honest —
     * "there is no record here" is true, and "you may not see it" is not.
     */
    if (!learner || learner.archivedAt) {
      throw new NotFoundException({ messageKey: 'errors.learner.not_found' });
    }

    return {
      id: learner.id,
      displayName: firstName(learner.fullName),
      level: resolveLevel(learner.level),
      /*
       * The catalogue's own label — "Form 3", "Lower Sixth" — sent alongside
       * the resolved surface rather than derived from it on the client. The
       * catalogue has sixteen rows and the surface has five configurations, so
       * one cannot be computed from the other without shipping the catalogue.
       */
      levelLabel:
        (user.preferredLanguage ?? learner.preferredLanguage) === 'fr'
          ? (learner.level?.nameFr ?? '')
          : (learner.level?.nameEn ?? ''),
      // 2.4: dates are stored UTC and rendered in Africa/Douala by the client.
      // A date-only column has no instant to convert, so it travels as written.
      targetExamDate: learner.targetExamDate
        ? learner.targetExamDate.toISOString().slice(0, 10)
        : null,
      freeze: await this.freezeFor(learner.id, learner.dob),
    };
  }

  /**
   * §6 — the frozen state, and the two rules that make it correct.
   *
   * "Never freeze mid-session": a freeze deferred for a session is recorded the
   * moment it is decided but does not take effect until that session ends, so a
   * child is never cut off partway through a lesson.
   *
   * "Do not show the amount owed to a minor": the payer is derived from the date
   * of birth (FR-FAM-006 — minor status is never a stored flag), and the balance
   * is only ever *read* on the branch that is allowed to send it.
   */
  private async freezeFor(learnerId: string, dob: Date): Promise<LearnerFreezeDto> {
    const now = new Date();

    const freeze = await this.prisma.accountFreeze.findFirst({
      where: {
        learnerId,
        scope: 'learner',
        liftedAt: null,
        effectiveFrom: { lte: now },
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { deferredForSessionId: true },
    });

    if (!freeze) return { active: false };

    if (freeze.deferredForSessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: freeze.deferredForSessionId },
        select: { status: true, endedAt: true },
      });
      // Still in the room: the freeze is on the books and not yet in force.
      if (session && session.status === 'in_progress' && !session.endedAt) {
        return { active: false };
      }
    }

    if (isMinor(dob, now)) {
      // 2.3 / FR-PAY-003. No balance is fetched on this path at all — there is
      // nothing in scope to leak into the response by accident.
      return { active: true, payer: 'guardian' };
    }

    return {
      active: true,
      payer: 'self',
      amountOutstandingXaf: await this.outstandingXaf(learnerId),
    };
  }

  /**
   * What an Adult Learner still owes: every instalment not yet paid, on a
   * schedule that has not been settled in full.
   *
   * CON-02 keeps money in whole XAF as `BigInt` in the database. It is narrowed
   * to `number` only here, at the edge, because a subscription balance is far
   * inside the safe integer range and JSON has no bigint.
   */
  private async outstandingXaf(learnerId: string): Promise<number> {
    const instalments = await this.prisma.instalment.findMany({
      where: {
        state: { not: 'paid' },
        schedule: {
          settledInFullAt: null,
          subscription: { learnerId },
        },
      },
      select: { amountXaf: true },
    });

    return instalments.reduce((total, row) => total + Number(row.amountXaf), 0);
  }
}

/**
 * The catalogue row a learner is enrolled on, as a surface.
 *
 * A learner with no level is possible — `levelId` is nullable, and an Admin can
 * create an account before deciding — and Secondary is the safe fallback for the
 * same reason it is in `levelFromCatalogue`: five tabs, no examination
 * furniture, no billing, no booking.
 */
function resolveLevel(level: { code: string; category: string } | null): LearnerLevel {
  return level ? levelFromCatalogue(level) : { key: 'secondary' };
}

/**
 * FR-SAF-007, applied to the greeting.
 *
 * "Hello, Ariane" rather than "Hello, Ariane Fotso". The surface is a shared
 * family phone in a shared room; the full name buys nothing a first name does
 * not, and costs a child's identity to anyone glancing at the screen.
 */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
