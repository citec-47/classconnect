-- A piece of work set for a study group.
--
-- Distinct from `assignments_work`, which is homework the platform grades: that
-- carries a mark, a submission, a deadline that locks and a teacher who owns the
-- marking. This is a shared to-do -- "read chapter 4 before Thursday" -- with no
-- mark and no submission. Conflating them would put ungraded reminders into the
-- gradebook.
CREATE TABLE "study_group_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    -- Optional, and it decides how the learner's list is grouped. A study group
    -- belongs to a level rather than a subject, so a task about revision in
    -- general genuinely has none.
    "subject_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    -- Soft, so a task somebody already ticked off does not vanish from their
    -- record when it is withdrawn.
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "study_group_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_group_tasks_group_id_deleted_at_idx"
  ON "study_group_tasks"("group_id", "deleted_at");

ALTER TABLE "study_group_tasks"
  ADD CONSTRAINT "study_group_tasks_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_tasks_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_tasks_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Who has ticked a task off. A row means done; no row means not done.
--
-- The same shape as `material_reads`, for the same reason: setting a task for a
-- group of ten would otherwise write ten rows to record something nobody has
-- done yet, and a learner joining next week would need one backfilled to appear
-- correctly undone. Un-ticking deletes the row, so `done_at` is always when it
-- was actually finished rather than when somebody last changed their mind.
CREATE TABLE "study_group_task_done" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "done_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_task_done_pkey" PRIMARY KEY ("task_id", "user_id")
);

CREATE INDEX "study_group_task_done_user_id_idx" ON "study_group_task_done"("user_id");

ALTER TABLE "study_group_task_done"
  ADD CONSTRAINT "study_group_task_done_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "study_group_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "study_group_task_done_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
