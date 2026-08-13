/**
 * The teacher surface's contracts: groups, exams, report marks, live and
 * messaging.
 *
 * One file rather than five because every schema here is validated at the same
 * boundary by the same controller family, and because the teacher screens read
 * each other's shapes — an exam is set for a group, a live session starts from a
 * timetable slot, a report mark belongs to a subject the teacher was verified
 * for. Splitting them would mean five files importing each other.
 *
 * Bounds are the coarse gate. The rules that matter — is this your class, is this
 * exercise still open, did every teacher submit — are re-derived server-side from
 * the database, because a client cannot be asked to assert them.
 */

import { z } from 'zod';
import { REPORT_TERMS } from './report-cards';

// ---------------------------------------------------------------------------
// Groups and exercises — BUILD-PLAN Phase 3
// ---------------------------------------------------------------------------

/**
 * A teacher creating a group.
 *
 * A `Cohort` — the model that already means "a group of learners taught together
 * by one teacher in one subject at one level". The teacher is not a field: it is
 * the signed-in user, so there is no id to change in order to create a group
 * under somebody else's name.
 */
export const createGroupSchema = z.object({
  name: z.string().min(2).max(200),
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  /**
   * FR-SCH-006 makes capacity a booking constraint, so it cannot be unbounded.
   * Forty is a Cameroonian class at the large end; the ceiling is generous rather
   * than aspirational.
   */
  capacity: z.number().int().min(1).max(200).default(40),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const groupMembersSchema = z.object({
  /** Learner ids to put in the group. Replaces the membership, not adds to it. */
  learnerIds: z.array(z.string().uuid()).max(200),
});
export type GroupMembersInput = z.infer<typeof groupMembersSchema>;

/**
 * An exercise set to a group.
 *
 * `dueAt` and `locksAt` are two different promises and both are kept: work handed
 * in after `dueAt` is accepted and marked late (FR-HWK-004); after `locksAt`
 * nothing is accepted at all. A teacher who wants the brief's hard deadline sets
 * them to the same instant, and the API is what enforces it.
 */
export const createExerciseSchema = z
  .object({
    cohortId: z.string().uuid(),
    title: z.string().min(2).max(300),
    instructions: z.string().min(1).max(20_000),
    dueAt: z.string().datetime(),
    /** Null or absent means the exercise never locks. */
    locksAt: z.string().datetime().optional(),
    maxScore: z.number().int().min(1).max(1000).default(20),
  })
  .refine(
    (input) => !input.locksAt || Date.parse(input.locksAt) >= Date.parse(input.dueAt),
    {
      // Locking before the due date would refuse work that is not yet late,
      // which is not a deadline — it is a bug with a clock on it.
      message: 'errors.exercise.locks_before_due',
      path: ['locksAt'],
    },
  );
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const awardGroupScoreSchema = z.object({
  cohortId: z.string().uuid(),
  score: z.number().int().min(0).max(1000),
  note: z.string().max(2000).optional(),
});
export type AwardGroupScoreInput = z.infer<typeof awardGroupScoreSchema>;

/** Reopening a locked exercise. A reason is required — it is audited. */
export const unlockExerciseSchema = z.object({
  reason: z.string().min(4).max(500),
});
export type UnlockExerciseInput = z.infer<typeof unlockExerciseSchema>;

// ---------------------------------------------------------------------------
// Exams — BUILD-PLAN Phase 4
// ---------------------------------------------------------------------------

/**
 * The three kinds of question the brief asks for, named as `QuestionType` already
 * names them.
 *
 * `single_choice` and `multiple_response` are the brief's "multiple questions";
 * `free_response` is its "structural" — a question a human marks. Deliberately the
 * schema's own words rather than a friendlier set mapped onto them: a translation
 * table between two vocabularies for the same three values is a bug waiting for
 * the fourth.
 *
 * `QuestionType` has four more values (`true_false`, `numeric`, `short_text`,
 * `matching`). They are not offered here because nothing on the teacher's screen
 * creates them yet, and an option that silently produces an unmarkable question
 * is worse than one that is absent.
 */
export const QUESTION_TYPES = ['single_choice', 'multiple_response', 'free_response'] as const;
export type TeacherQuestionType = (typeof QUESTION_TYPES)[number];

/** The question types this platform marks by itself. */
export function isAutoMarkable(type: TeacherQuestionType): boolean {
  return type !== 'free_response';
}

/**
 * One question, as the teacher writes it.
 *
 * `options` carry `isCorrect`, which is why this shape only ever travels *towards*
 * the server. FR-ASM-009 forbids an answer key reaching a learner's client before
 * release, and the learner-facing question DTO has nowhere to put one.
 */
export const examQuestionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().min(1).max(5000),
    marks: z.number().int().min(1).max(100).default(1),
    topic: z.string().max(200).optional(),
    options: z
      .array(
        z.object({
          label: z.string().min(1).max(1000),
          isCorrect: z.boolean().default(false),
        }),
      )
      .max(10)
      .optional(),
  })
  .superRefine((question, ctx) => {
    if (question.type === 'free_response') {
      // A structural question with options is a multiple-choice question the
      // teacher has mislabelled, and it would be marked by hand for ever.
      if (question.options && question.options.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'errors.exam.structural_has_options',
          path: ['options'],
        });
      }
      return;
    }

    const options = question.options ?? [];
    if (options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'errors.exam.needs_options',
        path: ['options'],
      });
      return;
    }

    const correct = options.filter((option) => option.isCorrect).length;
    /*
     * A multiple-choice question with no correct answer marks every learner
     * wrong, silently, and looks fine on the screen that created it. Refused
     * here rather than discovered by forty children.
     */
    if (correct === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'errors.exam.no_correct_option',
        path: ['options'],
      });
    }
    if (question.type === 'single_choice' && correct > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'errors.exam.single_answer_only',
        path: ['options'],
      });
    }
  });
export type ExamQuestionInput = z.infer<typeof examQuestionSchema>;

export const createExamSchema = z
  .object({
    title: z.string().min(2).max(300),
    subjectId: z.string().uuid(),
    levelId: z.string().uuid(),
    /** Narrower than the level, when the exam is for one group only. */
    cohortId: z.string().uuid().optional(),
    /** The existing `AssessmentType`, which has exactly these two values. */
    type: z.enum(['quiz', 'mock_exam']).default('quiz'),
    durationMin: z.number().int().min(1).max(600).optional(),
    opensAt: z.string().datetime().optional(),
    closesAt: z.string().datetime().optional(),
    /**
     * `immediate` marks and shows the result on submit; `deferred` marks and
     * withholds it. An exam with structural questions is `deferred` whatever is
     * sent here — the server overrides it, because a mark that is missing half
     * the paper is not a result.
     */
    releasePolicy: z.enum(['immediate', 'deferred']).default('immediate'),
    questions: z.array(examQuestionSchema).min(1).max(200),
  })
  .refine(
    (input) => !input.opensAt || !input.closesAt || Date.parse(input.closesAt) > Date.parse(input.opensAt),
    { message: 'errors.exam.closes_before_opens', path: ['closesAt'] },
  );
export type CreateExamInput = z.infer<typeof createExamSchema>;

/** Marking one structural answer by hand. */
export const markAnswerSchema = z.object({
  answerId: z.string().uuid(),
  awarded: z.number().int().min(0).max(100),
  comment: z.string().max(2000).optional(),
});
export type MarkAnswerInput = z.infer<typeof markAnswerSchema>;

export const markAttemptSchema = z.object({
  marks: z.array(markAnswerSchema).min(1).max(200),
  /** Release this learner's result on saving these marks. */
  release: z.boolean().default(false),
});
export type MarkAttemptInput = z.infer<typeof markAttemptSchema>;

// ---------------------------------------------------------------------------
// Report sheets — BUILD-PLAN Phase 6
// ---------------------------------------------------------------------------

/**
 * A teacher submitting one subject's termly marks for a class.
 *
 * The whole class in one request. The alternative — one request per learner —
 * would have a teacher of forty children make forty requests on a connection
 * where each costs about 235ms, and would leave a half-entered class if the
 * network dropped in the middle.
 */
export const submitTermMarksSchema = z.object({
  subjectId: z.string().uuid(),
  levelId: z.string().uuid(),
  term: z.enum(REPORT_TERMS),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, 'errors.report.bad_year'),
  /** The coefficient applies to the subject, so it is stated once. */
  coefficient: z.number().int().min(1).max(10).default(1),
  marks: z
    .array(
      z.object({
        learnerId: z.string().uuid(),
        /** Out of 20, and halves are ordinary in Cameroonian marking. */
        mark: z.number().min(0).max(20),
        comment: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .max(300),
});
export type SubmitTermMarksInput = z.infer<typeof submitTermMarksSchema>;

/** Staff generating a whole class's report cards, one click. */
export const generateReportCardsSchema = z.object({
  levelId: z.string().uuid(),
  term: z.enum(REPORT_TERMS),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/, 'errors.report.bad_year'),
  /** Publish immediately, or generate for checking first. */
  publish: z.boolean().default(false),
});
export type GenerateReportCardsInput = z.infer<typeof generateReportCardsSchema>;

// ---------------------------------------------------------------------------
// Live — BUILD-PLAN Phase 5
// ---------------------------------------------------------------------------

/**
 * Going live.
 *
 * `timetableSlotId` is optional because the brief is explicit that a teacher may
 * go live at any time. It is what the earnings calculation needs, though, so a
 * session started outside a slot is a lesson that happened and not an hour that
 * is paid for — and the teacher is told which, rather than discovering it on a
 * payslip.
 */
export const goLiveSchema = z
  .object({
    subjectId: z.string().uuid(),
    /** A group class. Exactly one of these two, like `Session` itself. */
    cohortId: z.string().uuid().optional(),
    /** A private one-to-one. */
    learnerId: z.string().uuid().optional(),
    timetableSlotId: z.string().uuid().optional(),
    durationMin: z.number().int().min(5).max(300).default(60),
  })
  .refine((input) => Boolean(input.cohortId) !== Boolean(input.learnerId), {
    // `Session` models exactly one of the two. Both or neither would leave a row
    // that no query for "who is in this lesson" can answer.
    message: 'errors.live.one_audience',
    path: ['cohortId'],
  });
export type GoLiveInput = z.infer<typeof goLiveSchema>;

/**
 * The host granting or revoking the floor.
 *
 * `MediaPublishRequest` already models this: a learner may only speak when the
 * teacher has said so, which is the brief's "students can only say something when
 * selected by the teacher".
 */
export const decidePublishRequestSchema = z.object({
  /**
   * `MediaPublishRequestState`'s own words — `approved`, `dismissed`, `revoked` —
   * rather than a friendlier trio mapped onto them. One vocabulary from the
   * button to the column.
   */
  decision: z.enum(['approved', 'dismissed', 'revoked']),
  /** FR-LIV-005: sharing a screen is a separate grant, not implied by speaking. */
  screenShare: z.boolean().default(false),
});
export type DecidePublishRequestInput = z.infer<typeof decidePublishRequestSchema>;

/** The host inviting a learner to speak without their having asked. */
export const inviteToSpeakSchema = z.object({
  learnerUserId: z.string().uuid(),
  screenShare: z.boolean().default(false),
});
export type InviteToSpeakInput = z.infer<typeof inviteToSpeakSchema>;

// ---------------------------------------------------------------------------
// Messaging — the teacher's inbox
// ---------------------------------------------------------------------------

/**
 * Who the teacher is talking to.
 *
 * `admin` covers ClassConnect staff generally rather than naming a person: an
 * agent joins a support thread on their first reply, so the teacher's screen
 * cannot promise a name before anyone has answered.
 */
export type TeacherCounterpartRole = 'admin' | 'learner' | 'guardian';

export interface TeacherThreadSummaryDto {
  threadId: string;
  counterpartName: string;
  counterpartRole: TeacherCounterpartRole;
  subject: { id: string; name: string } | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export const sendTeacherMessageSchema = z.object({
  body: z.string().max(5000).default(''),
  attachmentIds: z.array(z.string().uuid()).max(5).default([]),
});
export type SendTeacherMessageInput = z.infer<typeof sendTeacherMessageSchema>;
