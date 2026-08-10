/**
 * The learner surface's second wave: Subjects, Past lessons, Messages, Fees and
 * Ratings.
 *
 * Each of these carries a prohibition that has to survive contact with a
 * developer in a hurry, so where a rule can be enforced by the *shape* of a
 * type rather than by a check somewhere, it is:
 *
 *  - A minor's fee status has no amount field (FR-PAY-003, §7). A component
 *    cannot leak what the type does not carry.
 *  - A teacher-facing rating carries no rater, no session and no timestamp
 *    (FR-RAT-001). There is nothing to correlate.
 *  - A message has no `delete` in its action set. Deletion is a safeguarding
 *    power, not a participant one.
 */

import type { IsoDate, IsoInstant, SubjectRefDto, TeacherRefDto } from './learner-dto';

/**
 * A teacher reference that carries an id.
 *
 * `TeacherRefDto` deliberately carries a display name and nothing else, and
 * that restraint is right for the surfaces that only need to say who taught a
 * lesson. Rating needs an identifier to post against, so it gets its own type
 * rather than widening the shared one — the narrower type stays narrow
 * everywhere it is already used, which is most places.
 *
 * The id is an opaque uuid, not contact detail. FR-SAF-001 forbids exposing a
 * teacher's phone, email or handles; it does not forbid the platform's own
 * primary key, and the server re-checks the assignment on every write anyway.
 */
export interface RatableTeacherRefDto extends TeacherRefDto {
  id: string;
}

/* ------------------------------------------------------------------ *
 * Subjects
 * ------------------------------------------------------------------ */

/**
 * One subject the learner is enrolled in, as the Subjects tab lists it.
 *
 * The teacher is nullable because enrolment and assignment are separate acts:
 * a learner picks Chemistry at registration and an Admin assigns someone to
 * teach it days later (FR-SCH-002). Between those two moments the subject is
 * real and the surface has to say so honestly rather than hide the row.
 */
export interface LearnerSubjectDto {
  subject: SubjectRefDto;
  /** Null until an Admin has assigned and the teacher has accepted. */
  teacher: RatableTeacherRefDto | null;
  /** Sessions on this subject in the next seven days. */
  upcomingCount: number;
  /** Recordings available to watch, already filtered by retention. */
  recordingCount: number;
  /** Work set on this subject and not yet handed in. */
  outstandingWorkCount: number;
  /** This learner's own most recent rating of this teacher, 1–5, or null. */
  myRating: number | null;
  /** Whether a rating may be given now — false when there is no teacher yet. */
  canRate: boolean;
}

/** A single slot in the weekly timetable, resolved to Africa/Douala. */
export interface TimetableSlotDto {
  sessionId: string;
  subject: SubjectRefDto;
  teacher: TeacherRefDto | null;
  startsAt: IsoInstant;
  durationMin: number;
  type: 'one_to_one' | 'group';
  /** 1 = Monday … 7 = Sunday, in Africa/Douala, precomputed server-side. */
  weekday: number;
  /** Whether this slot is inside the join window now (FR-LIV-003). */
  joinable: boolean;
}

/**
 * The Subjects tab in one response.
 *
 * `levelLabel` travels with it because §"student class always shows" wants the
 * learner's class on screen, and the surface should not be assembling that
 * string from a code it had to learn how to read.
 */
export interface LearnerSubjectsDto {
  levelLabel: string;
  subjects: LearnerSubjectDto[];
  /** The whole week, flattened; the client groups by `weekday`. */
  timetable: TimetableSlotDto[];
  /** Monday of the week the timetable covers, Africa/Douala. */
  weekStart: IsoDate;
}

/* ------------------------------------------------------------------ *
 * Past lessons
 * ------------------------------------------------------------------ */

/**
 * A finished lesson, whether or not the learner turned up.
 *
 * That last part is the requirement: the recording is made and kept for every
 * learner booked into the session, so a child who missed Tuesday because the
 * power was out can still watch Tuesday. `attended` therefore describes the
 * learner's history, not their entitlement — it changes the badge on the card
 * and nothing about access.
 */
export interface PastLessonDto {
  sessionId: string;
  subject: SubjectRefDto;
  teacher: TeacherRefDto | null;
  startedAt: IsoInstant;
  durationMin: number;
  /** FR-LIV-014: from the media server's join/leave events, not self-report. */
  attended: boolean;
  attendedMinutes: number;
  recording: PastLessonRecordingDto | null;
  /** Why there is no recording, when there is none. */
  recordingState: 'ready' | 'processing' | 'expired' | 'not_recorded';
  /** Whether this learner has already rated the teacher for this session. */
  rated: boolean;
}

export interface PastLessonRecordingDto {
  id: string;
  durationSec: number;
  /** FR-LIV-013 / §5.5: the retention date, shown so its going is not a shock. */
  availableUntil: IsoInstant;
  /** NFR-BAN-002: say what it costs before it costs it. */
  estimatedBytes: number | null;
  /** The audio-only rendition, when one exists. Far cheaper on 3G. */
  audioAvailable: boolean;
  audioEstimatedBytes: number | null;
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export interface MessageThreadSummaryDto {
  threadId: string;
  /** Who the learner is talking to. Support threads have no subject. */
  counterpartName: string;
  counterpartRole: 'teacher' | 'support';
  subject: SubjectRefDto | null;
  lastMessageAt: IsoInstant | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface MessageAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** FR-FIL-001: nothing is downloadable until the scan has passed. */
  scanStatus: 'pending' | 'clean' | 'quarantined';
  /** Signed and short-lived (FR-FIL-003). Null while pending or quarantined. */
  url: string | null;
  durationSec: number | null;
}

/**
 * One message.
 *
 * There is no `deletable` flag and no `deletedAt`, because a participant can do
 * neither. What a learner or teacher sends, they have sent. The schema keeps
 * `deleted_at` for one purpose only — a safeguarding officer redacting genuinely
 * harmful content — and that path is staff-side and audited, so it does not
 * belong in a learner-facing type.
 */
export interface MessageDto {
  id: string;
  /** True when this learner sent it. Alignment, not identity. */
  mine: boolean;
  senderName: string;
  /** FR-SAF-002 redaction already applied server-side. */
  body: string;
  /** True when redaction changed something, so the UI can say why. */
  redacted: boolean;
  sentAt: IsoInstant;
  attachments: MessageAttachmentDto[];
}

export interface MessageThreadDto {
  threadId: string;
  counterpartName: string;
  counterpartRole: 'teacher' | 'support';
  subject: SubjectRefDto | null;
  /** False when the teacher is suspended or the assignment has ended. */
  mayPost: boolean;
  /** A message key explaining why, when `mayPost` is false. */
  cannotPostReasonKey: string | null;
  messages: MessageDto[];
}

/** What the composer will accept. Enforced server-side; sent so the UI can say so. */
/** A file being prepared for a message: signed, uploading, scanned, or refused. */
export interface PendingAttachmentDto {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  state: 'uploading' | 'scanning' | 'ready' | 'failed';
  /** A message key when `failed`, so the reason is translatable. */
  errorKey?: string;
  /**
   * A local object URL for the preview, made from the file the user picked.
   *
   * Client-only, and deliberately local: previewing from the *uploaded* copy
   * would mean waiting for the upload and the scan before the sender could see
   * what they chose, which is backwards — the preview exists so they can check
   * before committing. It also costs no bandwidth on a metered connection.
   *
   * Revoked when the attachment is removed or the composer unmounts.
   */
  previewUrl?: string;
}

export interface MessageComposeLimitsDto {
  maxAttachments: number;
  maxBytesPerFile: number;
  /** FR-FIL-002: an allow-list, by MIME type. No executables, no archives. */
  acceptedMimeTypes: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Fees
 * ------------------------------------------------------------------ */

export type FeeStageState = 'paid' | 'due' | 'overdue' | 'upcoming' | 'cancelled';

export interface FeeStageDto {
  /** 1, 2 or 3. */
  sequence: number;
  state: FeeStageState;
  /** Africa/Douala calendar date. Null on a pay-in-full schedule. */
  dueOn: IsoDate | null;
  paidOn: IsoDate | null;
  /**
   * The instalment amount.
   *
   * Optional in the type because a schedule may exist before amounts are known,
   * not because it is withheld — see the fees service for why it is now always
   * sent, and what the safer long-term shape is.
   */
  amountXaf?: number;
}

/**
 * The fee status a learner sees.
 *
 * Deliberately a progress indicator rather than a bill. A minor sees which of
 * the three stages are done and which is next — enough to understand why the
 * app locked, never enough to know what their family owes.
 */
/** A fee message the learner or their guardian was sent. */
export interface FeeNoticeDto {
  id: string;
  /** e.g. `fees.status_changed`. Rendered client-side from `notifications.<eventType>.body`. */
  eventType: string;
  /**
   * The message as it was sent, already rendered.
   *
   * The notification service interpolates before storing, because the same text
   * goes out by SMS and email where there is no client to render it. Returning
   * it verbatim also makes this an accurate record of what the family was
   * actually told.
   */
  body: string;
  at: IsoInstant;
}

export interface LearnerFeesDto {
  planType: 'full' | 'three_instalments';
  /** 'completed' once every stage is paid. */
  overall: 'not_started' | 'in_progress' | 'completed';
  stages: FeeStageDto[];
  /** Who to talk to about it. A minor is told their guardian handles it. */
  payer: 'guardian' | 'self';
  /**
   * Recent fee messages, newest first.
   *
   * The same notices the learner was sent, shown on the screen they are about —
   * a parent checking what changed should find the answer here rather than in an
   * inbox. Carries no amounts of its own; the message text is generated from the
   * event and respects the same rule as the rest of this DTO.
   */
  notices: FeeNoticeDto[];
  totalXaf?: number;
  /** What has been settled so far — drives the progress bar. */
  paidXaf?: number;
  outstandingXaf?: number;
}

/* ------------------------------------------------------------------ *
 * Ratings
 * ------------------------------------------------------------------ */

/**
 * A rating as the learner submits it.
 *
 * Per teacher *and* subject: a teacher who is excellent at Maths and struggling
 * with Further Maths is one teacher with two different answers, and averaging
 * them tells an Admin nothing useful.
 */
export interface RatingSubmissionDto {
  teacherUserId: string;
  subjectId: string;
  /** 1–5. */
  stars: number;
  comment?: string;
  /** Optional: ties the rating to a specific lesson when given from one. */
  sessionId?: string;
}

/**
 * What the learner gets back, and what they see of their own history.
 *
 * The teacher-facing view of the same data lives on the teacher surface and
 * carries none of these fields — no rater, no session, no timestamp, and no
 * per-rating rows at all. A teacher sees an average and a count above a
 * threshold, which is what makes "the teacher will never know where the rating
 * came from" true rather than merely intended: with three learners and a
 * visible timestamp, anonymity is arithmetic anyone can do.
 */
export interface MyRatingDto {
  subject: SubjectRefDto;
  teacher: RatableTeacherRefDto;
  stars: number;
  comment: string | null;
  ratedAt: IsoInstant;
  /** True while the learner may still change it. */
  editable: boolean;
}

/** FR-RAT-002: an average is not shown until enough ratings exist to mean anything. */
export const RATING_DISPLAY_THRESHOLD = 5;

/** The window in which a learner may revise a rating they just gave. */
export const RATING_EDIT_WINDOW_HOURS = 24;

/* ------------------------------------------------------------------ *
 * Starting a conversation
 * ------------------------------------------------------------------ */

/**
 * Someone a learner may open a thread with.
 *
 * The reachable set is deliberately tiny: the teachers actually assigned to
 * this learner, and ClassConnect support. It is not a directory, and it is not
 * searchable beyond those.
 *
 * Other learners are absent, and that absence is the requirement. FR-SAF-008
 * forbids learner-to-learner messaging in v1.0, and FR-SAF-007 keeps a minor's
 * name off any surface another user can see — a search box returning children's
 * names to another child would breach both at once. Search here filters a list
 * the learner is already entitled to see, which is a different thing from
 * querying a population.
 */
export interface MessageContactDto {
  /** The teacher's user id, or the literal 'support'. */
  id: string;
  displayName: string;
  kind: 'teacher' | 'support';
  /** Which subject they teach this learner. Null for support. */
  subject: SubjectRefDto | null;
  /** An existing thread, when one is already open. */
  threadId: string | null;
}

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

export interface AttendanceSessionDto {
  sessionId: string;
  subject: SubjectRefDto;
  startedAt: IsoInstant;
  durationMin: number;
  attended: boolean;
  attendedMinutes: number;
}

/**
 * A learner's attendance, as something they can act on.
 *
 * A single percentage is a grade, not a prompt. The per-subject split and the
 * recent list are what let a learner see *where* they are slipping, which is
 * the only version of this number worth showing a child.
 */
export interface LearnerAttendanceDto {
  attended: number;
  scheduled: number;
  percentage: number;
  /** Consecutive most-recent sessions attended. */
  streak: number;
  bySubject: Array<{
    subject: SubjectRefDto;
    attended: number;
    scheduled: number;
    percentage: number;
  }>;
  /** Most recent first, capped. */
  recent: AttendanceSessionDto[];
}
