-- Which published materials a learner has already opened.
--
-- Rows exist only for materials that have been read. The alternative -- a row
-- per learner per material, created on publish and flipped on open -- writes
-- one row per child in the class every time a teacher uploads a worksheet, to
-- record something that has not happened yet. Unread is the absence of a row,
-- which is also the right answer for a learner who joined the class after the
-- material was published.
--
-- The composite primary key is the deduplication: opening the same lesson twice
-- is one fact, not two, and `read_at` keeps the first time rather than the last.
CREATE TABLE "material_reads" (
    "material_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_reads_pkey" PRIMARY KEY ("material_id", "user_id")
);

-- The unread count is "materials at my level minus my rows", so the read side
-- is looked up by learner.
CREATE INDEX "material_reads_user_id_idx" ON "material_reads"("user_id");

ALTER TABLE "material_reads"
  ADD CONSTRAINT "material_reads_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "material_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
