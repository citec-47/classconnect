-- What a period pays, per hour, in XAF.
--
-- On the slot rather than on the teacher: a slot already is one teacher, one
-- class, one subject, one hour of the week, which is the granularity the rate
-- was asked for. A per-teacher table could not pay differently for Form 5
-- Further Maths than for Form 1 general science, which is the usual reason to
-- vary a rate at all.
--
-- Nullable, and null on every existing row. Null means "whatever the platform
-- pays" and keeps tracking `earnings.teacher_hourly_rate_xaf`; a number means an
-- admin decided this period specifically. Writing the current default onto every
-- row instead would freeze thousands of snapshots that stop following the
-- platform figure, with nothing on screen to say which.
ALTER TABLE "timetable_slots"
  ADD COLUMN "hourly_rate_xaf" INTEGER;
