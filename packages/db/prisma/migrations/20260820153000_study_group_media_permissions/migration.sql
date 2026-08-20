ALTER TABLE "study_group_members"
  ADD COLUMN "allow_images" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_videos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_voice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allow_documents" BOOLEAN NOT NULL DEFAULT true;
