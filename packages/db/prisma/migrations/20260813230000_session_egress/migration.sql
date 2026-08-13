-- The recording job behind a live lesson.
--
-- SI-005: LiveKit records each room through an "egress", identified by a job id
-- it returns when recording starts. Holding it lets the lesson stop its own
-- recording when the teacher ends the class, and lets a recording that never
-- appeared be traced to the job that should have produced it.
--
-- Nullable: the media server may be unreachable, and FR-LIV would rather have a
-- lesson with no recording than no lesson.
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "egress_id" VARCHAR(200);
