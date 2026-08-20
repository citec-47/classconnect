-- Student-created study groups are class-scoped and retain their conversation
-- through a soft delete.  The thread is a real message thread so attachments,
-- moderation, and safeguarding retention use the same storage as every other
-- in-platform conversation.

ALTER TYPE "MessageThreadKind" ADD VALUE IF NOT EXISTS 'study_group';

CREATE TABLE "study_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "level_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "max_members" INTEGER NOT NULL DEFAULT 10,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "study_groups_thread_id_key" ON "study_groups"("thread_id");
CREATE INDEX "study_groups_level_id_deleted_at_idx" ON "study_groups"("level_id", "deleted_at");
CREATE INDEX "study_groups_owner_user_id_idx" ON "study_groups"("owner_user_id");

ALTER TABLE "study_groups"
  ADD CONSTRAINT "study_groups_level_id_fkey"
    FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "study_groups_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "study_groups_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "study_group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "left_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_members_pkey" PRIMARY KEY ("group_id", "user_id")
);

CREATE INDEX "study_group_members_user_id_left_at_idx"
  ON "study_group_members"("user_id", "left_at");

ALTER TABLE "study_group_members"
  ADD CONSTRAINT "study_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
