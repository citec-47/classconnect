-- One class, one period, one lesson.
--
-- A teacher's claim now takes effect immediately, with no staff step between
-- claiming and appearing on the class timetable. The service checks the period
-- is free before writing, but read-then-write does not survive two teachers
-- claiming the same period at the same moment — and the outcome there is two
-- lessons timetabled on top of each other in front of a class.
--
-- Partial, excluding `rejected`: a refused slot is history and must not reserve
-- a period against the teacher who eventually takes it.
--
-- Left as an index rather than a table constraint because Prisma cannot express
-- a partial unique constraint; the database enforces it either way, which is the
-- part that matters.
CREATE UNIQUE INDEX IF NOT EXISTS "timetable_slots_class_period_unique"
  ON "timetable_slots" ("level_id", "day_of_week", "start_minute")
  WHERE "state" <> 'rejected';
