-- When a teacher released a lesson to the class. Null while it is a draft.
--
-- A separate fact from `scan_status`. A file can be scanned clean and still not
-- be ready: the teacher wants to look at it first, or it is next Thursday's
-- worksheet uploaded this Monday. Conflating the two meant the class received
-- every upload the instant the scanner finished.
ALTER TABLE "materials"
  ADD COLUMN "published_at" TIMESTAMPTZ(6);

-- Everything already uploaded was, by the old rule, already visible to its
-- class. Backfilling from `created_at` keeps that true: without it this
-- migration would silently retract every lesson ever published, and learners
-- would open My lessons to find the term's material gone.
UPDATE "materials" SET "published_at" = "created_at" WHERE "published_at" IS NULL;
