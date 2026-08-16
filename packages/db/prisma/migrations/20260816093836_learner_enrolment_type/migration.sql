-- CreateEnum
CREATE TYPE "EnrolmentType" AS ENUM ('school', 'private');

-- DropForeignKey
ALTER TABLE "session_invites" DROP CONSTRAINT "session_invites_session_id_fkey";

-- DropForeignKey
ALTER TABLE "session_invites" DROP CONSTRAINT "session_invites_user_id_fkey";

-- DropIndex
DROP INDEX "timetable_slots_level_session_day_idx";

-- AlterTable
ALTER TABLE "group_scores" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "learners" ADD COLUMN     "enrolment_type" "EnrolmentType" NOT NULL DEFAULT 'school';

-- AlterTable
ALTER TABLE "report_card_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "report_cards" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "session_invites" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subject_term_marks" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "timetable_slots" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_invites" ADD CONSTRAINT "session_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "session_invites_session_user_unique" RENAME TO "session_invites_session_id_user_id_key";

-- RenameIndex
ALTER INDEX "session_invites_user_active_idx" RENAME TO "session_invites_user_id_revoked_at_idx";
