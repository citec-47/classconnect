-- Who the host let into an invite-only call.
--
-- FR: "nobody can join unless the teacher has invited them. Someone who has not
-- been invited must be refused even if they have the link."
--
-- A timetabled lesson has a roster — the cohort booked into it — and the join
-- token is checked against that. The default Go Live call has no roster at all,
-- so this table is one. Without it "invite-only" could only ever be a hidden
-- button, which is exactly what the brief refuses.
CREATE TABLE IF NOT EXISTS "session_invites" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "invited_by" UUID NOT NULL,
  "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  -- Withdrawn rather than deleted: who was admitted to a call, and when, is a
  -- safeguarding question, and a deleted row answers it with silence.
  "revoked_at" TIMESTAMPTZ(6)
);

-- One invitation per person per call. Inviting somebody twice is the same
-- invitation, not a second one, and re-inviting after a withdrawal should
-- revive the row rather than accumulate history nobody can read.
CREATE UNIQUE INDEX IF NOT EXISTS "session_invites_session_user_unique"
  ON "session_invites" ("session_id", "user_id");

-- The read on the join path: "is this person invited, and still invited?"
CREATE INDEX IF NOT EXISTS "session_invites_user_active_idx"
  ON "session_invites" ("user_id", "revoked_at");

COMMENT ON TABLE "session_invites" IS
  'Guest list for invite-only calls. Checked server-side before a join token is issued.';
