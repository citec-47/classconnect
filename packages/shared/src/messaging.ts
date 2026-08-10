/**
 * Messaging reach and deletion rules — §5.
 *
 * FR-SAF-008 is the requirement that shapes this file: learner-to-learner
 * messaging must not exist. Not disabled, not behind a flag — absent. So the
 * permitted pairings are enumerated here as data, and everything else is denied
 * by falling off the end of the list rather than by a rule someone can delete.
 */

import type { Role } from './roles';

/** Mirrors `MessageThreadKind` in the schema. */
export type ThreadKind = 'learner_teacher' | 'learner_support' | 'guardian_teacher';

export const THREAD_KINDS: readonly ThreadKind[] = [
  'learner_teacher',
  'learner_support',
  'guardian_teacher',
];

/**
 * The complete set of conversations the platform will carry.
 *
 * Read this as the answer to "who can reach my child?". A learner reaches the
 * teacher they are assigned to, and support. Nobody else reaches them, and they
 * reach nobody else — least of all another learner.
 */
interface Pairing {
  kind: ThreadKind;
  initiator: Role;
  counterpart: Role;
  /** Whether the pairing requires an existing teaching assignment. */
  requiresAssignment: boolean;
}

const PAIRINGS: readonly Pairing[] = [
  { kind: 'learner_teacher', initiator: 'student', counterpart: 'teacher', requiresAssignment: true },
  { kind: 'learner_teacher', initiator: 'adult_learner', counterpart: 'teacher', requiresAssignment: true },
  { kind: 'guardian_teacher', initiator: 'parent', counterpart: 'teacher', requiresAssignment: true },
  // Support is reachable without an assignment: a learner who cannot reach
  // anyone is exactly who most needs to reach someone (FR-SUP-001).
  { kind: 'learner_support', initiator: 'student', counterpart: 'support_agent', requiresAssignment: false },
  { kind: 'learner_support', initiator: 'adult_learner', counterpart: 'support_agent', requiresAssignment: false },
  { kind: 'learner_support', initiator: 'parent', counterpart: 'support_agent', requiresAssignment: false },
];

export interface ReachRequest {
  initiatorRoles: readonly Role[];
  counterpartRoles: readonly Role[];
  /** Whether the two are actually connected by a teaching assignment. */
  assigned: boolean;
}

export interface ReachDecision {
  allowed: boolean;
  kind: ThreadKind | null;
  /** A message key when refused, so the reason is translatable (NFR-LOC-002). */
  refusalKey: string | null;
}

/**
 * Whether one party may open a thread with another.
 *
 * Note what has no branch here: two learners. There is no pairing for it and no
 * `ThreadKind` that could hold it, so the answer is "no" for the same reason
 * the endpoint returns 404 — the concept does not exist in the model.
 */
export function mayReach(request: ReachRequest): ReachDecision {
  const match = PAIRINGS.find(
    (pairing) =>
      request.initiatorRoles.includes(pairing.initiator) &&
      request.counterpartRoles.includes(pairing.counterpart),
  );

  if (!match) return { allowed: false, kind: null, refusalKey: 'errors.messaging.not_permitted' };
  if (match.requiresAssignment && !request.assigned) {
    return { allowed: false, kind: null, refusalKey: 'errors.messaging.not_assigned' };
  }
  return { allowed: true, kind: match.kind, refusalKey: null };
}

/** Whether these two roles could ever hold a conversation. Used to prove FR-SAF-008. */
export function pairingExists(initiator: Role, counterpart: Role): boolean {
  return PAIRINGS.some((p) => p.initiator === initiator && p.counterpart === counterpart);
}

// ---------------------------------------------------------------------------
// §5.4 — deletion
// ---------------------------------------------------------------------------

export interface DeletionRequest {
  senderUserId: string;
  actorUserId: string;
  actorRoles: readonly Role[];
  /** §5.4: a thread under investigation cannot have messages removed from it. */
  threadUnderSafeguardingHold: boolean;
  alreadyDeleted: boolean;
}

export type DeletionDecision =
  | { allowed: true }
  | { allowed: false; refusalKey: string };

const STAFF: readonly Role[] = ['admin_ops', 'admin_finance', 'super_admin', 'support_agent'];

/**
 * Whether a message may be hidden behind a tombstone.
 *
 * "Hidden" is the strongest verb available. The product owner's wording — a
 * student or admin can delete a message, but they cannot delete the information
 * — is the soft-delete contract exactly: `state` flips, `body` stays, and the
 * safeguarding view and audit log still resolve the original in full.
 *
 * There is no `hardDelete` in this module, and no caller can ask for one. Actual
 * erasure is a documented data-subject workflow with legal sign-off
 * (NFR-PRV-004), not an API a role holds.
 */
export function mayDelete(request: DeletionRequest): DeletionDecision {
  if (request.alreadyDeleted) {
    return { allowed: false, refusalKey: 'errors.messaging.already_deleted' };
  }
  if (request.threadUnderSafeguardingHold) {
    // Hidden with an explanation rather than silently absent: a control that
    // vanishes without reason reads as a bug and invites a support ticket.
    return { allowed: false, refusalKey: 'errors.messaging.safeguarding_hold' };
  }

  const isSender = request.actorUserId === request.senderUserId;
  const isStaff = request.actorRoles.some((role) => STAFF.includes(role));
  if (!isSender && !isStaff) {
    return { allowed: false, refusalKey: 'errors.messaging.not_your_message' };
  }
  return { allowed: true };
}

/**
 * Who can still see the original after deletion.
 *
 * Both parties see that *something* was removed — that is the whole safeguarding
 * value of the tombstone. A silent deletion would let a teacher erase an
 * inappropriate message from a child's view, or a learner erase evidence of
 * harassment against them, and in both cases the person who most needs to know
 * a message existed is the one it disappears for.
 */
export function tombstoneVisibleTo(): readonly ('sender' | 'recipient' | 'guardian' | 'safeguarding')[] {
  return ['sender', 'recipient', 'guardian', 'safeguarding'];
}
