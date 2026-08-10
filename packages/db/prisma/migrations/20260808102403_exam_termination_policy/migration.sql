-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctorEventKind" ADD VALUE 'camera_restored';
ALTER TYPE "ProctorEventKind" ADD VALUE 'mic_restored';
ALTER TYPE "ProctorEventKind" ADD VALUE 'terminated_by_system';

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "terminated_at" TIMESTAMPTZ(6),
ADD COLUMN     "termination_reason" VARCHAR(30);
