-- CreateEnum
CREATE TYPE "StreamOffReason" AS ENUM ('learner_choice', 'system_bandwidth', 'system_policy', 'device_failure');

-- CreateEnum
CREATE TYPE "MediaPublishRequestState" AS ENUM ('pending', 'approved', 'dismissed', 'withdrawn', 'revoked');

-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('in_progress', 'submitted', 'flagged_for_review', 'under_review', 'released', 'voided_by_human');

-- CreateEnum
CREATE TYPE "ProctorEventKind" AS ENUM ('device_check_passed', 'camera_degraded_to_still_frames', 'camera_disabled', 'camera_failed', 'mic_failed', 'mic_disabled', 'bandwidth_drop', 'disconnected', 'resumed');

-- CreateEnum
CREATE TYPE "ProctorFlagKind" AS ENUM ('sustained_background_noise');

-- CreateEnum
CREATE TYPE "MessageThreadKind" AS ENUM ('learner_teacher', 'learner_support', 'guardian_teacher');

-- CreateEnum
CREATE TYPE "MessageState" AS ENUM ('visible', 'deleted');

-- DropForeignKey
ALTER TABLE "account_freezes" DROP CONSTRAINT "account_freezes_learner_id_fkey";

-- DropForeignKey
ALTER TABLE "account_freezes" DROP CONSTRAINT "account_freezes_teacher_user_id_fkey";

-- DropForeignKey
ALTER TABLE "account_freezes" DROP CONSTRAINT "account_freezes_triggering_instalment_id_fkey";

-- DropForeignKey
ALTER TABLE "earnings" DROP CONSTRAINT "earnings_payout_id_fkey";

-- DropForeignKey
ALTER TABLE "instalments" DROP CONSTRAINT "instalments_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "instalments" DROP CONSTRAINT "instalments_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_refund_of_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_items" DROP CONSTRAINT "reconciliation_items_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_items" DROP CONSTRAINT "reconciliation_items_run_id_fkey";

-- DropForeignKey
ALTER TABLE "redaction_flags" DROP CONSTRAINT "redaction_flags_learner_id_fkey";

-- DropForeignKey
ALTER TABLE "redaction_flags" DROP CONSTRAINT "redaction_flags_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "safeguarding_reports" DROP CONSTRAINT "safeguarding_reports_subject_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "safeguarding_reports" DROP CONSTRAINT "safeguarding_reports_ticket_id_fkey";

-- DropForeignKey
ALTER TABLE "support_agent_profiles" DROP CONSTRAINT "support_agent_profiles_user_id_fkey";

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "consent_id" UUID,
ADD COLUMN     "overridden_at" TIMESTAMPTZ(6),
ADD COLUMN     "overridden_by" UUID,
ADD COLUMN     "proctored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "state" "AttemptState" NOT NULL DEFAULT 'in_progress';

-- AlterTable
ALTER TABLE "instalments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recordings" ADD COLUMN     "audio_key" VARCHAR(500),
ADD COLUMN     "audio_size_bytes" BIGINT;

-- AlterTable
ALTER TABLE "session_participants" ADD COLUMN     "camera_off_reason" "StreamOffReason",
ADD COLUMN     "camera_on_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mic_off_reason" "StreamOffReason",
ADD COLUMN     "mic_on_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "media_publish_requests" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "learner_user_id" UUID NOT NULL,
    "state" "MediaPublishRequestState" NOT NULL DEFAULT 'pending',
    "screen_share" BOOLEAN NOT NULL DEFAULT false,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,

    CONSTRAINT "media_publish_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_device_checks" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "mic_working" BOOLEAN NOT NULL,
    "camera_working" BOOLEAN NOT NULL,
    "bandwidth_kbps" INTEGER,
    "disclosure_version" VARCHAR(20) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_device_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctor_events" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "kind" "ProctorEventKind" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB,

    CONSTRAINT "proctor_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proctor_flags" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "kind" "ProctorFlagKind" NOT NULL DEFAULT 'sustained_background_noise',
    "sequence" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "peak_db" DECIMAL(6,2),
    "sustained_ms" INTEGER NOT NULL,
    "evidence_key" VARCHAR(500),
    "evidence_scan_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "evidence_until" TIMESTAMPTZ(6),

    CONSTRAINT "proctor_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_reviews" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewer_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "outcome" VARCHAR(20),
    "rationale" TEXT,
    "learner_statement" TEXT,

    CONSTRAINT "attempt_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_playback" (
    "recording_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position_sec" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recording_playback_pkey" PRIMARY KEY ("recording_id","user_id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "kind" "MessageThreadKind" NOT NULL,
    "learner_id" UUID,
    "teacher_user_id" UUID,
    "subject_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMPTZ(6),
    "safeguarding_hold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_participants" (
    "thread_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "may_post" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_participants_pkey" PRIMARY KEY ("thread_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "body_original" TEXT,
    "state" "MessageState" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_versions" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "replaced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "scan_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "duration_sec" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_publish_requests_session_id_state_requested_at_idx" ON "media_publish_requests"("session_id", "state", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "exam_device_checks_attempt_id_key" ON "exam_device_checks"("attempt_id");

-- CreateIndex
CREATE INDEX "proctor_events_attempt_id_occurred_at_idx" ON "proctor_events"("attempt_id", "occurred_at");

-- CreateIndex
CREATE INDEX "proctor_flags_attempt_id_occurred_at_idx" ON "proctor_flags"("attempt_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "proctor_flags_attempt_id_sequence_key" ON "proctor_flags"("attempt_id", "sequence");

-- CreateIndex
CREATE INDEX "attempt_reviews_attempt_id_idx" ON "attempt_reviews"("attempt_id");

-- CreateIndex
CREATE INDEX "attempt_reviews_decided_at_idx" ON "attempt_reviews"("decided_at");

-- CreateIndex
CREATE INDEX "message_threads_learner_id_last_message_at_idx" ON "message_threads"("learner_id", "last_message_at");

-- CreateIndex
CREATE INDEX "message_threads_teacher_user_id_last_message_at_idx" ON "message_threads"("teacher_user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "thread_participants_user_id_idx" ON "thread_participants"("user_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "message_versions_message_id_replaced_at_idx" ON "message_versions"("message_id", "replaced_at");

-- CreateIndex
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "attempts_state_submitted_at_idx" ON "attempts"("state", "submitted_at");

-- CreateIndex
CREATE INDEX "consents_user_id_learner_id_consent_type_idx" ON "consents"("user_id", "learner_id", "consent_type");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_of_payment_id_fkey" FOREIGN KEY ("refund_of_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "teachers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_triggering_instalment_id_fkey" FOREIGN KEY ("triggering_instalment_id") REFERENCES "instalments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_reports" ADD CONSTRAINT "safeguarding_reports_subject_teacher_id_fkey" FOREIGN KEY ("subject_teacher_id") REFERENCES "teachers"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_reports" ADD CONSTRAINT "safeguarding_reports_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redaction_flags" ADD CONSTRAINT "redaction_flags_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redaction_flags" ADD CONSTRAINT "redaction_flags_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_publish_requests" ADD CONSTRAINT "media_publish_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_publish_requests" ADD CONSTRAINT "media_publish_requests_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_device_checks" ADD CONSTRAINT "exam_device_checks_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proctor_flags" ADD CONSTRAINT "proctor_flags_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_reviews" ADD CONSTRAINT "attempt_reviews_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_playback" ADD CONSTRAINT "recording_playback_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_playback" ADD CONSTRAINT "recording_playback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_versions" ADD CONSTRAINT "message_versions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "sessions_starts_at_teacher_idx" RENAME TO "sessions_starts_at_utc_teacher_id_idx";

-- RenameIndex
ALTER INDEX "sessions_status_starts_at_idx" RENAME TO "sessions_status_starts_at_utc_idx";
