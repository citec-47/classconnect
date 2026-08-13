-- Timetable sessions, a longer week, and suspended periods.
--
-- Three changes, all additive. Nothing already recorded moves: existing slots
-- are Monday-to-Friday day-session periods, which is exactly what the defaults
-- below give them.

-- 1. The three grids a period can sit in.
--
-- `private` is not a time of day. It is a 24/7 arrangement filled by an admin
-- rather than claimed by a teacher, and it overlaps the other two in wall-clock
-- terms — so the session has to be stored rather than derived from the hour.
CREATE TYPE "TimetableSession" AS ENUM ('day', 'evening', 'private');

ALTER TABLE "timetable_slots"
  ADD COLUMN "session" "TimetableSession" NOT NULL DEFAULT 'day';

-- 2. An admin can suspend a period.
--
-- FR: "the admin can put any subject or course on hold. Everyone in that class,
-- students and teachers, will see it" — and during live classes the slot reads
-- Free Period, open to the class to use between themselves.
--
-- A new state rather than a boolean: a suspended period is not un-timetabled,
-- it is timetabled and not being taught, and the difference decides both what
-- the grid renders and whether anything may accrue against it.
ALTER TYPE "TimetableSlotState" ADD VALUE IF NOT EXISTS 'on_hold';

-- 3. The school week becomes configurable.
--
-- `day_of_week` was 1–5. The private session runs 24/7 regardless of the school
-- week, and the week itself is now 24/5, 24/6 or 24/7 from `PlatformConfig`, so
-- the column has to be able to hold Saturday and Sunday.
--
-- The bound is widened here and enforced in the service against the configured
-- length, so changing the week is a configuration change and not a migration.
ALTER TABLE "timetable_slots"
  DROP CONSTRAINT IF EXISTS "timetable_slots_day_of_week_check";

ALTER TABLE "timetable_slots"
  ADD CONSTRAINT "timetable_slots_day_of_week_check"
  CHECK ("day_of_week" BETWEEN 1 AND 7);

-- Reading a class grid means "this level, this session, this day", and reading a
-- teacher's week means "this teacher, this day". Both are covered.
CREATE INDEX IF NOT EXISTS "timetable_slots_level_session_day_idx"
  ON "timetable_slots" ("level_id", "session", "day_of_week");
