-- Indexes for the columns the admin screens actually filter and sort on.
--
-- Added after measuring rather than in advance: each one below is a predicate
-- that appeared in a query on the benchmarked path. An index nobody's WHERE
-- clause matches costs write throughput and buys nothing.
--
-- CONCURRENTLY is deliberately not used: Prisma runs each migration inside a
-- transaction and CREATE INDEX CONCURRENTLY cannot run in one. These tables are
-- small enough that the brief lock is not worth splitting the migration for; on
-- a large production table the right move would be to run them by hand.

-- The teacher roster filters by band and lists unclassified teachers first.
-- `school_type IS NULL` is the most-used filter on that screen — it is the set
-- who cannot be assigned a learner (FR-SCH-002) — so it gets its own partial
-- index rather than relying on a scan of a low-cardinality column.
CREATE INDEX IF NOT EXISTS "teachers_school_type_idx"
  ON "teachers" ("school_type");

CREATE INDEX IF NOT EXISTS "teachers_unclassified_idx"
  ON "teachers" ("verification_status")
  WHERE "school_type" IS NULL;

-- §4.2/§4.3: the approval queues select on approval_state and order by
-- submitted_at. The composite serves both in one pass.
CREATE INDEX IF NOT EXISTS "learners_approval_state_submitted_at_idx"
  ON "learners" ("approval_state", "submitted_at");

-- The live board and the schedule both filter sessions by status and by a time
-- window. `sessions_starts_at_utc_idx` and `sessions_status_idx` already exist
-- separately; the pair is what these queries actually use together.
CREATE INDEX IF NOT EXISTS "sessions_status_starts_at_idx"
  ON "sessions" ("status", "starts_at_utc");

-- The weekly timetable reads a date range and groups by teacher.
CREATE INDEX IF NOT EXISTS "sessions_starts_at_teacher_idx"
  ON "sessions" ("starts_at_utc", "teacher_id");

-- Teacher hours aggregate attendance by user. Without this, every roster page
-- sequentially scans session_participants once per group-by.
CREATE INDEX IF NOT EXISTS "session_participants_user_id_idx"
  ON "session_participants" ("user_id");

-- The approval checks look consent up by (guardian, learner, type). The
-- existing index is (user_id, consent_type), which cannot narrow by learner —
-- so a guardian with several children scanned all of their consents.
CREATE INDEX IF NOT EXISTS "consents_user_learner_type_idx"
  ON "consents" ("user_id", "learner_id", "consent_type")
  WHERE "revoked_at" IS NULL;
