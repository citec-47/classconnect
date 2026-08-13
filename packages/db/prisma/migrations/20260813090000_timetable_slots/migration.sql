-- Phase 1 of BUILD-PLAN.md — the timetabled teaching week.
--
-- `AvailabilityRule` says when a teacher is free. This says what they are
-- timetabled to teach, which is a different fact and the one that live sessions
-- start from and earnings are counted inside.

CREATE TYPE "TimetableSlotState" AS ENUM ('proposed', 'confirmed', 'rejected');

CREATE TABLE "timetable_slots" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "level_id"      UUID NOT NULL,
    "cohort_id"     UUID,
    "teacher_id"    UUID NOT NULL,
    "subject_id"    UUID NOT NULL,
    -- 1 = Monday … 5 = Friday.
    "day_of_week"   SMALLINT NOT NULL,
    -- Minutes from midnight. Integers so the clash rule is plain arithmetic and
    -- no session timezone can reach a question about local wall-clock time.
    "start_minute"  SMALLINT NOT NULL,
    "end_minute"    SMALLINT NOT NULL,
    "state"         "TimetableSlotState" NOT NULL DEFAULT 'proposed',
    "confirmed_by"  UUID,
    "confirmed_at"  TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- The school week, and a slot that ends after it starts. Enforced here rather
-- than only in the application: a zero-length or reversed interval makes the
-- clash rule silently agree with everything.
ALTER TABLE "timetable_slots"
  ADD CONSTRAINT "timetable_slots_day_of_week_check" CHECK ("day_of_week" BETWEEN 1 AND 5),
  ADD CONSTRAINT "timetable_slots_minutes_check"
    CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");

-- The two reads this table exists for.
CREATE INDEX "timetable_slots_teacher_id_day_of_week_idx"
  ON "timetable_slots"("teacher_id", "day_of_week");
CREATE INDEX "timetable_slots_level_id_day_of_week_idx"
  ON "timetable_slots"("level_id", "day_of_week");

ALTER TABLE "timetable_slots"
  ADD CONSTRAINT "timetable_slots_level_id_fkey"
    FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "timetable_slots_cohort_id_fkey"
    FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "timetable_slots_teacher_id_fkey"
    FOREIGN KEY ("teacher_id") REFERENCES "teachers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "timetable_slots_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "timetable_slots_confirmed_by_fkey"
    FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
