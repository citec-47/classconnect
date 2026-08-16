-- AlterTable
ALTER TABLE "timetable_slots" ADD COLUMN     "proposed_at" TIMESTAMPTZ(6),
ADD COLUMN     "proposed_by" UUID,
ADD COLUMN     "proposed_end_minute" SMALLINT,
ADD COLUMN     "proposed_start_minute" SMALLINT;
