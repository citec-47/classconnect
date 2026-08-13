-- Admin-assigned subjects, and the special permission to exceed two periods.
--
-- A teacher's subjects came only from their own application. Admin and customer
-- service now assign them — category, then class, then subjects — and the
-- timetable offers a teacher exactly this list and nothing else.
--
-- All three columns are nullable, so every row already recorded stays valid and
-- keeps the standard allowance.

ALTER TABLE "teacher_subjects"
  ADD COLUMN IF NOT EXISTS "period_allowance" SMALLINT,
  ADD COLUMN IF NOT EXISTS "assigned_by" UUID,
  ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ(6);

-- Deliberately not a foreign key to `users`.
--
-- Every other attribution column here cascades on delete, and this one must not:
-- if the admin who granted a subject is ever removed, the record of who granted
-- it is exactly the thing worth keeping. It is read for display and for audit,
-- never joined in a hot path.
COMMENT ON COLUMN "teacher_subjects"."assigned_by" IS
  'Staff user who assigned this subject. Not an FK: the attribution outlives the account.';

COMMENT ON COLUMN "teacher_subjects"."period_allowance" IS
  'Overrides the two-period weekly limit for this teacher, subject and class. Null = standard.';
