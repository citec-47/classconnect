-- An ask, rather than an addition.
--
-- Adding a classmate without consulting them is defensible for people who
-- already sit in the same room every day. It is not defensible for somebody in
-- another class, and certainly not for a teacher -- being placed into a group of
-- children by one of them is the wrong way round. Reaching outside the class
-- goes through an invitation the invitee answers.
--
-- One row per (group, person), reused rather than accumulated: re-inviting
-- somebody who declined sets the row back to pending. A history of every ask
-- would turn "who is in this group" into a query over the latest of several
-- rows, which is the kind of question that gets answered wrongly.

CREATE TYPE "StudyGroupInvitationStatus" AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE "study_group_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "inviter_user_id" UUID NOT NULL,
    "invitee_user_id" UUID NOT NULL,
    "status" "StudyGroupInvitationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "study_group_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "study_group_invitations_group_id_invitee_user_id_key"
  ON "study_group_invitations"("group_id", "invitee_user_id");
-- "What am I being asked to join" -- the badge on the invitee's Work page.
CREATE INDEX "study_group_invitations_invitee_user_id_status_idx"
  ON "study_group_invitations"("invitee_user_id", "status");

ALTER TABLE "study_group_invitations"
  ADD CONSTRAINT "study_group_invitations_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_invitations_inviter_user_id_fkey"
    FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_invitations_invitee_user_id_fkey"
    FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
