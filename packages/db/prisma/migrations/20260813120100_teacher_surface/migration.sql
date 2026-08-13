-- The rest of the teacher surface: groups with a locking deadline, exams that
-- know which class they are for, report sheets, and a live session that traces
-- back to the timetable slot it was taught in.
--
-- Every table below was checked against the schema first. Four concepts had no
-- home and are added; everything else is a column on a table that already models
-- the thing (BUILD-PLAN.md: "grep the schema for the concept first").

-- ---------------------------------------------------------------------------
-- Group exercises — the locking deadline
-- ---------------------------------------------------------------------------
--
-- `WorkAssignment` already models a piece of set work with a due date. What it
-- does not model is the brief's "once it is the exact time, the group
-- automatically locks, and only the teacher or the main admin can open it
-- again" — which is a different fact from `due_at`. Work can be handed in late;
-- a locked exercise cannot be handed in at all.
ALTER TABLE "assignments_work"
  ADD COLUMN "locks_at"    TIMESTAMPTZ(6),
  ADD COLUMN "unlocked_by" UUID,
  ADD COLUMN "unlocked_at" TIMESTAMPTZ(6);

ALTER TABLE "assignments_work"
  ADD CONSTRAINT "assignments_work_unlocked_by_fkey"
    FOREIGN KEY ("unlocked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The countdown on the learner's screen reads this, so it is the one column that
-- is queried on its own.
CREATE INDEX "assignments_work_locks_at_idx" ON "assignments_work"("locks_at");

-- ---------------------------------------------------------------------------
-- Group scores
-- ---------------------------------------------------------------------------
--
-- A new table, and the justification: `Grade` hangs off `Submission`, which is
-- one learner's work. The brief's group score is one mark awarded to a cohort
-- for a shared exercise, and writing it as a `Grade` per member would require
-- inventing a `Submission` for learners who handed nothing in — turning "not
-- submitted" into "submitted, empty" for every group the teacher marks.
CREATE TABLE "group_scores" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignmentId" UUID NOT NULL,
    "cohortId"     UUID NOT NULL,
    "score"        INTEGER NOT NULL,
    "note"         TEXT,
    "awardedBy"    UUID NOT NULL,
    "awardedAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_scores_pkey" PRIMARY KEY ("id")
);

-- One score per exercise per group. Re-marking updates it rather than stacking a
-- second mark nobody can choose between.
CREATE UNIQUE INDEX "group_scores_assignmentId_cohortId_key"
  ON "group_scores"("assignmentId", "cohortId");

ALTER TABLE "group_scores"
  ADD CONSTRAINT "group_scores_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "assignments_work"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_scores_cohortId_fkey"
    FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_scores_awardedBy_fkey"
    FOREIGN KEY ("awardedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Exams — who they are set for, and when they are open
-- ---------------------------------------------------------------------------
--
-- `Assessment` carried a subject and nothing about its audience, so the learner
-- surface listed every assessment in a subject they take. The brief wants "the
-- exams set to them by their various teachers", which needs a class.
ALTER TABLE "assessments"
  ADD COLUMN "level_id"            UUID,
  ADD COLUMN "cohort_id"           UUID,
  ADD COLUMN "opens_at"            TIMESTAMPTZ(6),
  ADD COLUMN "closes_at"           TIMESTAMPTZ(6),
  -- Until this is set the exam is a draft: the teacher is still writing it and
  -- no learner may see it, which is why it is nullable rather than a boolean
  -- defaulting to false. The timestamp answers "since when", which a boolean
  -- cannot.
  ADD COLUMN "published_at"        TIMESTAMPTZ(6),
  -- FR-ASM-004: a deferred-release exam is marked but withheld until the teacher
  -- has read the structural answers.
  ADD COLUMN "results_released_at" TIMESTAMPTZ(6);

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_level_id_fkey"
    FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "assessments_cohort_id_fkey"
    FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The learner's exam list: published exams for their level, newest first.
CREATE INDEX "assessments_level_id_published_at_idx"
  ON "assessments"("level_id", "published_at");
CREATE INDEX "assessments_created_by_idx" ON "assessments"("created_by");

-- ---------------------------------------------------------------------------
-- Report cards
-- ---------------------------------------------------------------------------
--
-- New, and the one genuinely absent concept BUILD-PLAN named. `Grade` holds a
-- single mark for a single piece of work. A termly report card is a different
-- object: many subjects, each with a coefficient, a weighted average, and a
-- position in the class.
CREATE TABLE "report_cards" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "learnerId"   UUID NOT NULL,
    "levelId"     UUID NOT NULL,
    -- `term_1` | `term_2` | `term_3`. A varchar rather than an enum: Cameroonian
    -- schools do not all use three terms and an enum would need a migration to
    -- find that out.
    "term"        VARCHAR(20) NOT NULL,
    "academicYear" VARCHAR(20) NOT NULL,
    -- Stored, not computed on read. The average a family was shown in December
    -- must not change because a teacher edited a mark in March; a recomputation
    -- writes a new row.
    "averageMark" DECIMAL(5,2),
    "totalCoefficient" INTEGER NOT NULL DEFAULT 0,
    "classPosition"    INTEGER,
    "classSize"        INTEGER,
    "remark"      TEXT,
    "generatedBy" UUID,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Generated and published are separate acts: a report card is checked before
    -- a family sees it.
    "publishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- One report card per learner per term per year. A regeneration overwrites.
CREATE UNIQUE INDEX "report_cards_learnerId_term_academicYear_key"
  ON "report_cards"("learnerId", "term", "academicYear");
CREATE INDEX "report_cards_levelId_term_academicYear_idx"
  ON "report_cards"("levelId", "term", "academicYear");

ALTER TABLE "report_cards"
  ADD CONSTRAINT "report_cards_learnerId_fkey"
    FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "report_cards_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "report_cards_generatedBy_fkey"
    FOREIGN KEY ("generatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "report_card_lines" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "reportCardId" UUID NOT NULL,
    "subjectId"    UUID NOT NULL,
    "mark"         DECIMAL(5,2) NOT NULL,
    -- The Cameroonian coefficient: Maths at 4 counts four times a subject at 1.
    "coefficient"  INTEGER NOT NULL DEFAULT 1,
    "teacherId"    UUID,
    "comment"      TEXT,
    "submittedAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_card_lines_reportCardId_subjectId_key"
  ON "report_card_lines"("reportCardId", "subjectId");

ALTER TABLE "report_card_lines"
  ADD CONSTRAINT "report_card_lines_reportCardId_fkey"
    FOREIGN KEY ("reportCardId") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "report_card_lines_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "report_card_lines_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "teachers"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Marks a teacher has entered but not yet folded into a report card. The brief's
-- "after all the teachers have submitted their reports" needs somewhere for a
-- mark to sit before that click, and it is not the report card itself.
CREATE TABLE "subject_term_marks" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "learnerId"   UUID NOT NULL,
    "subjectId"   UUID NOT NULL,
    "teacherId"   UUID NOT NULL,
    "levelId"     UUID NOT NULL,
    "term"        VARCHAR(20) NOT NULL,
    "academicYear" VARCHAR(20) NOT NULL,
    "mark"        DECIMAL(5,2) NOT NULL,
    "coefficient" INTEGER NOT NULL DEFAULT 1,
    "comment"     TEXT,
    "createdAt"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subject_term_marks_pkey" PRIMARY KEY ("id")
);

-- One mark per learner per subject per term. Editing replaces.
CREATE UNIQUE INDEX "subject_term_marks_learnerId_subjectId_term_academicYear_key"
  ON "subject_term_marks"("learnerId", "subjectId", "term", "academicYear");
-- Generation reads a whole class's marks for one term in one query.
CREATE INDEX "subject_term_marks_levelId_term_academicYear_idx"
  ON "subject_term_marks"("levelId", "term", "academicYear");
CREATE INDEX "subject_term_marks_teacherId_idx" ON "subject_term_marks"("teacherId");

ALTER TABLE "subject_term_marks"
  ADD CONSTRAINT "subject_term_marks_learnerId_fkey"
    FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subject_term_marks_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subject_term_marks_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "teachers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subject_term_marks_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Live — the session and the slot it was taught in
-- ---------------------------------------------------------------------------
--
-- FR-ERN-003 pays for timetabled teaching, and the brief is explicit that a
-- teacher may go live at any time but only earns "during their exact number of
-- time to resume work". Deriving that afterwards by matching a start time
-- against the week is guesswork the moment a slot is edited; the link records
-- which slot the session was claimed against, at the instant it went live.
ALTER TABLE "sessions" ADD COLUMN "timetable_slot_id" UUID;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_timetable_slot_id_fkey"
    FOREIGN KEY ("timetable_slot_id") REFERENCES "timetable_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "sessions_teacher_id_status_idx" ON "sessions"("teacher_id", "status");
