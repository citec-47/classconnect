-- Admin-created student and teacher accounts.
--
-- FR-PRO-001 keeps its full six-level taxonomy; this adds the two-way grouping
-- an Admin chooses between when creating an account: primary school (Class 1–6)
-- or secondary school (Form 1–5, Lower Sixth, Upper Sixth).
--
-- `levels` already holds 16 seeded rows, so `school_type` is added nullable,
-- backfilled from the existing `category`, and only then made NOT NULL. Adding
-- it as NOT NULL in one step would fail against real data — DAT-010 requires
-- migrations to be reversible and safe, not merely correct on an empty schema.

-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('primary', 'secondary');

-- FR-RBA-004: record which Admin brought each account into existence.
ALTER TABLE "learners" ADD COLUMN "created_by" UUID;

ALTER TABLE "teachers"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "school_type" "SchoolType";

-- Step 1: add nullable.
ALTER TABLE "levels" ADD COLUMN "school_type" "SchoolType";

-- Step 2: backfill from the existing category.
--   primary                        -> primary
--   secondary, high_school, exam,
--   adult                          -> secondary
-- A learner sitting GCE O/L or A/L is a secondary-school learner, so the
-- examination tracks group under secondary rather than becoming a third type.
UPDATE "levels" SET "school_type" = 'primary'   WHERE "category" = 'primary';
UPDATE "levels" SET "school_type" = 'secondary' WHERE "category" <> 'primary';

-- Step 3: any row the backfill missed would be a level added outside the seed.
-- Default it to secondary rather than failing the migration, then constrain.
UPDATE "levels" SET "school_type" = 'secondary' WHERE "school_type" IS NULL;

ALTER TABLE "levels" ALTER COLUMN "school_type" SET NOT NULL;

-- CreateIndex
CREATE INDEX "levels_school_type_sort_order_idx" ON "levels"("school_type", "sort_order");
