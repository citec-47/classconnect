/**
 * The learner surface's wire contract (§5 of the student brief).
 *
 * These types are the enforcement mechanism for two of §10's acceptance
 * criteria, which is why they live here rather than being inferred at each end:
 *
 *   criterion 6  — "Answer keys are absent from every network response before
 *                  release." `PracticeQuestionDto` has no field for one. A
 *                  service that tried to send it would not compile.
 *   criterion 10 — "No API response to a learner contains a teacher's phone
 *                  number, email or address." `TeacherRefDto` carries a display
 *                  name and nothing else, and it is the only shape any of these
 *                  responses uses to refer to a teacher.
 *
 * A prohibition expressed as a type is one nobody has to remember.
 */

/**
 * FR-SAF-001 / FR-PRO-005: a teacher, as a learner may see them.
 *
 * Deliberately not extensible. Adding a contact field here would light up every
 * response at once, which is exactly the review this warrants.
 */
export interface TeacherRefDto {
  displayName: string;
}

export interface SubjectRefDto {
  id: string;
  name: string;
}

/** 2.4: instants travel as UTC ISO strings and are rendered in Africa/Douala. */
export type IsoInstant = string;
/** A calendar fact rather than an instant — a due date, an exam date. */
export type IsoDate = string;

/**
 * Appendix A's session state model, unflattened.
 *
 * The learner surface could get away with "done / cancelled / missed", but
 * cancelled-by-teacher and cancelled-by-learner are different events to the
 * person reading the row — one is an apology owed to them, the other a decision
 * they made — and collapsing them at the API would make that distinction
 * unrecoverable. The client groups them for display; the wire keeps them apart.
 */
export type SessionStatusDto =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_learner'
  | 'cancelled_by_teacher'
  | 'no_show_teacher'
  | 'no_show_learner'
  | 'aborted'
  | 'disputed'
  | 'voided';

/** The statuses that put a session behind the learner rather than ahead of it. */
export const PAST_SESSION_STATUSES: readonly SessionStatusDto[] = [
  'completed',
  'cancelled_by_learner',
  'cancelled_by_teacher',
  'no_show_teacher',
  'no_show_learner',
  'aborted',
];

export interface SessionDto {
  id: string;
  subject: SubjectRefDto;
  teacher: TeacherRefDto;
  startsAt: IsoInstant;
  durationMin: number;
  type: 'one_to_one' | 'group';
  status: SessionStatusDto;
  /**
   * FR-LIV-003: the join window, computed server-side.
   *
   * The client counts down to `joinOpensAt` and enables the control between the
   * two. It does not decide when the window is — a device clock on a shared
   * family phone is not something to hang a lesson on.
   */
  joinOpensAt: IsoInstant;
  joinClosesAt: IsoInstant;
  /** FR-SAF-004 / FR-LIV-012: disclosed at booking and again at join. */
  recordingEnabled: boolean;
  /** FR-SCH-007: whether cancelling now still returns the entitlement. */
  cancellation: { noticeHours: number; freeUntil: IsoInstant } | null;
  recording: RecordingDto | null;
}

/** FR-LIV-013: published within an hour, and gone on the retention date. */
export interface RecordingDto {
  id: string;
  durationSec: number;
  /** Shown to the learner, so nobody is surprised when it disappears. */
  availableUntil: IsoInstant;
  ready: boolean;
}

export interface HomeworkDto {
  id: string;
  title: string;
  subject: SubjectRefDto;
  teacher: TeacherRefDto;
  dueAt: IsoInstant;
  maxScore: number;
  /** FR-HWK-004 */
  isLate: boolean;
  state: 'to_do' | 'submitted' | 'graded';
  submittedAt: IsoInstant | null;
  grade: GradeDto | null;
}

export interface GradeDto {
  score: number;
  maxScore: number;
  feedbackText: string | null;
  /** FR-HWK-006: presence flags, not the media itself — the payload budget. */
  hasAudioFeedback: boolean;
  hasAnnotations: boolean;
  gradedAt: IsoInstant;
  /** FR-HWK-007: marked since this learner last looked. */
  unread: boolean;
}

export interface MaterialDto {
  id: string;
  title: string;
  subject: SubjectRefDto;
  topic: string | null;
  mimeType: string;
  sizeBytes: number;
  /** NFR-BAN-002: shown before any download on a metered connection. */
  createdAt: IsoInstant;
}

export interface PracticeItemDto {
  id: string;
  title: string;
  subject: SubjectRefDto;
  kind: 'quiz' | 'mock' | 'past_paper';
  durationMin: number | null;
  questionCount: number;
  attemptsAllowed: number;
  attemptsUsed: number;
  /** The learner's best result so far, once released. */
  bestPercentage: number | null;
  /** Past papers only. The number, not "Paper 2" — the label is translated. */
  year: number | null;
  paperNo: number | null;
}

/**
 * A question as the client is allowed to see it, mid-attempt.
 *
 * No `answerKey`, no `isCorrect` on the options, no `marks` breakdown that would
 * let a client infer one. §10 criterion 6 says this is verified by inspecting
 * payloads rather than by reading code — the test does exactly that, and this
 * type is what makes the test hard to fail by accident.
 */
export interface PracticeQuestionDto {
  id: string;
  type: 'single_choice' | 'multi_choice' | 'short_text' | 'numeric' | 'essay';
  prompt: string;
  sectionName: string | null;
  marks: number;
  options: Array<{ id: string; label: string }>;
}

export interface ProgressDto {
  attendance: { attended: number; scheduled: number; percentage: number };
  homework: { completed: number; issued: number; onTimePercentage: number };
  /** Most recent first, capped — a sparkline, not a data warehouse. */
  scores: Array<{ at: IsoInstant; subject: string; percentage: number }>;
  strengths: TopicScoreDto[];
  weaknesses: TopicScoreDto[];
  /** FR-RPT-001 */
  teacherComments: Array<{
    at: IsoInstant;
    teacher: TeacherRefDto;
    subject: SubjectRefDto;
    comment: string;
  }>;
  /**
   * FR-GCE-004 — an estimate of preparation, never a prediction of a result.
   *
   * `drivers` exists because the requirement is a plain-language explanation of
   * what drives the figure. A number with no account of itself is the thing an
   * angry parent quotes back at you in August.
   */
  readiness: Array<{
    subject: SubjectRefDto;
    percentage: number;
    drivers: Array<{ key: string; value: number }>;
  }> | null;
}

export interface TopicScoreDto {
  topic: string;
  subject: string;
  percentage: number;
  answered: number;
}

/**
 * The whole home screen in one response.
 *
 * NFR-PER-001 and 2.4: five cards fetched separately is five round trips at
 * 300ms RTT before anything is legible. The server already holds the level
 * configuration, so it sends what this learner's home screen actually shows and
 * nothing else.
 */
export interface LearnerHomeDto {
  nextSession: SessionDto | null;
  homeworkDue: HomeworkDto[];
  newlyGraded: HomeworkDto[];
  examCountdown: { targetDate: IsoDate; daysRemaining: number } | null;
  weakestTopic: TopicScoreDto | null;
}
