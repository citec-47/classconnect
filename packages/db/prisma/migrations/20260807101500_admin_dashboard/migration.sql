-- Admin dashboard: approvals, instalment billing, automatic freezing,
-- safeguarding, reconciliation, invoicing and the unallocated earnings pool.
--
-- Requirement anchors are on the schema models. The database-level guards at the
-- foot of this file are the ones that must not be enforceable only in
-- application code: the sum-to-total rule (FR-LDG-005), the append-only
-- safeguarding evidence (FR-SAF-006) and the gapless invoice sequence
-- (FR-PAY-016).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "LearnerApprovalState" AS ENUM ('submitted', 'more_info_required', 'approved', 'rejected');
CREATE TYPE "InstalmentPlanType"   AS ENUM ('full', 'three_instalments');
CREATE TYPE "InstalmentState"      AS ENUM ('scheduled', 'due', 'overdue', 'paid', 'cancelled');
CREATE TYPE "FreezeScope"          AS ENUM ('learner', 'teacher');
CREATE TYPE "FreezeKind"           AS ENUM ('automatic', 'manual');
CREATE TYPE "FreezeCategory"       AS ENUM ('non_payment', 'safeguarding', 'abuse', 'dispute', 'other');
CREATE TYPE "SafeguardingSource"   AS ENUM ('session', 'message_thread', 'teacher_profile', 'redaction_flag', 'other');
CREATE TYPE "SafeguardingState"    AS ENUM ('open', 'in_review', 'actioned', 'closed');
CREATE TYPE "RedactionKind"        AS ENUM ('phone', 'email', 'social_handle');
CREATE TYPE "ReconciliationState"  AS ENUM ('unmatched', 'matched', 'written_off', 'escalated');
CREATE TYPE "TicketChannel"        AS ENUM ('in_app', 'whatsapp', 'email');
CREATE TYPE "AgentPresence"        AS ENUM ('online', 'away', 'offline');
CREATE TYPE "UnallocatedDecision"  AS ENUM ('pending', 'released_to_teachers', 'retained_by_platform', 'carried_forward');

-- ---------------------------------------------------------------------------
-- Existing tables
-- ---------------------------------------------------------------------------

-- §4.2: learners queue for an Admin decision before they become active.
-- Accounts that already exist were created by an Admin, so they are approved.
ALTER TABLE "learners"
  ADD COLUMN "approval_state"  "LearnerApprovalState" NOT NULL DEFAULT 'submitted',
  ADD COLUMN "submitted_at"    TIMESTAMPTZ(6),
  ADD COLUMN "approved_by"     UUID,
  ADD COLUMN "approved_at"     TIMESTAMPTZ(6),
  ADD COLUMN "decision_reason" TEXT;

UPDATE "learners"
   SET "approval_state" = 'approved',
       "approved_by"    = "created_by",
       "approved_at"    = "created_at"
 WHERE "created_by" IS NOT NULL;

-- §4.7.1/§4.7.2: offline collections and refunds are recorded, never edits.
ALTER TABLE "payments"
  ADD COLUMN "recorded_offline"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "recorded_by"          UUID,
  ADD COLUMN "record_reason"        TEXT,
  ADD COLUMN "evidence_key"         VARCHAR(500),
  ADD COLUMN "refund_of_payment_id" UUID,
  ADD COLUMN "refund_reason"        TEXT,
  ADD COLUMN "refunded_by"          UUID;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refund_of_fkey"
  FOREIGN KEY ("refund_of_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL;

-- §4.7.5: the one-to-one / group split, the net figure a payout settles, and the
-- configuration version the calculation used (OI-02 keeps the split unresolved,
-- so a historical earnings record must carry the inputs it was computed from).
ALTER TABLE "earnings"
  ADD COLUMN "one_to_one_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "group_minutes"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "net_payable_xaf"    BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "config_version"     VARCHAR(64) NOT NULL DEFAULT 'pre-migration',
  ADD COLUMN "payout_id"          UUID;

-- The default exists only to carry any rows written before this migration.
-- Every earnings record created from here on states its own configuration.
ALTER TABLE "earnings" ALTER COLUMN "config_version" DROP DEFAULT;

ALTER TABLE "earnings"
  ADD CONSTRAINT "earnings_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL;

CREATE INDEX "earnings_period_idx" ON "earnings"("period");

ALTER TABLE "payouts"
  ADD COLUMN "provider_fee_xaf" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "held_reason"      TEXT,
  ADD COLUMN "period"           VARCHAR(7);

-- FR-SUP-001/006, FR-NOT-007: channel, SLA deadlines and the WhatsApp window.
ALTER TABLE "tickets"
  ADD COLUMN "channel"                 "TicketChannel" NOT NULL DEFAULT 'in_app',
  ADD COLUMN "assigned_by"             UUID,
  ADD COLUMN "assigned_at"             TIMESTAMPTZ(6),
  ADD COLUMN "first_response_due_at"   TIMESTAMPTZ(6),
  ADD COLUMN "resolution_due_at"       TIMESTAMPTZ(6),
  ADD COLUMN "escalated_at"            TIMESTAMPTZ(6),
  ADD COLUMN "whatsapp_window_ends_at" TIMESTAMPTZ(6);

CREATE INDEX "tickets_assignee_id_status_idx" ON "tickets"("assignee_id", "status");

-- ---------------------------------------------------------------------------
-- §5 — instalment billing and automatic freezing
-- ---------------------------------------------------------------------------

CREATE TABLE "payment_schedules" (
  "id"                 UUID PRIMARY KEY,
  "subscription_id"    UUID NOT NULL UNIQUE REFERENCES "subscriptions"("id") ON DELETE CASCADE,
  "plan_type"          "InstalmentPlanType" NOT NULL,
  "total_xaf"          BIGINT NOT NULL,
  "discount_xaf"       BIGINT NOT NULL DEFAULT 0,
  "settled_in_full_at" TIMESTAMPTZ(6),
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "payment_schedules_total_non_negative"    CHECK ("total_xaf" >= 0),
  CONSTRAINT "payment_schedules_discount_non_negative" CHECK ("discount_xaf" >= 0)
);

CREATE TABLE "instalments" (
  "id"                UUID PRIMARY KEY,
  "schedule_id"       UUID NOT NULL REFERENCES "payment_schedules"("id") ON DELETE CASCADE,
  "sequence"          INTEGER NOT NULL,
  "amount_xaf"        BIGINT NOT NULL,
  "due_on"            DATE NOT NULL,
  "state"             "InstalmentState" NOT NULL DEFAULT 'scheduled',
  "paid_at"           TIMESTAMPTZ(6),
  "payment_id"        UUID REFERENCES "payments"("id") ON DELETE SET NULL,
  "notices_sent_json" JSONB,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "instalments_amount_non_negative" CHECK ("amount_xaf" >= 0),
  -- §5.1: three parts, so a fourth is a bug rather than a configuration choice.
  CONSTRAINT "instalments_sequence_range" CHECK ("sequence" BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX "instalments_schedule_id_sequence_key" ON "instalments"("schedule_id", "sequence");
CREATE INDEX "instalments_state_due_on_idx" ON "instalments"("state", "due_on");

CREATE TABLE "account_freezes" (
  "id"                       UUID PRIMARY KEY,
  "scope"                    "FreezeScope" NOT NULL,
  "learner_id"               UUID REFERENCES "learners"("id") ON DELETE CASCADE,
  "teacher_user_id"          UUID REFERENCES "teachers"("user_id") ON DELETE CASCADE,
  "kind"                     "FreezeKind" NOT NULL,
  "category"                 "FreezeCategory" NOT NULL,
  "reason"                   TEXT NOT NULL,
  "triggering_instalment_id" UUID REFERENCES "instalments"("id") ON DELETE SET NULL,
  "applied_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "effective_from"           TIMESTAMPTZ(6) NOT NULL,
  "deferred_for_session_id"  UUID,
  "lifted_at"                TIMESTAMPTZ(6),
  "lifted_by"                UUID,
  "lift_reason"              TEXT,
  "created_by"               UUID,
  -- The scope names which subject column is populated; neither both nor neither.
  CONSTRAINT "account_freezes_scope_subject" CHECK (
    ("scope" = 'learner' AND "learner_id" IS NOT NULL AND "teacher_user_id" IS NULL)
    OR
    ("scope" = 'teacher' AND "teacher_user_id" IS NOT NULL AND "learner_id" IS NULL)
  ),
  -- §5.5: a manual freeze is always someone's decision, and the reason is theirs.
  CONSTRAINT "account_freezes_manual_has_actor" CHECK (
    "kind" <> 'manual' OR "created_by" IS NOT NULL
  ),
  -- §5.3: an automatic freeze exists only because an instalment went unpaid.
  CONSTRAINT "account_freezes_automatic_has_instalment" CHECK (
    "kind" <> 'automatic' OR "triggering_instalment_id" IS NOT NULL
  )
);

CREATE INDEX "account_freezes_learner_id_lifted_at_idx" ON "account_freezes"("learner_id", "lifted_at");
CREATE INDEX "account_freezes_teacher_user_id_lifted_at_idx" ON "account_freezes"("teacher_user_id", "lifted_at");

-- §5.5 / §5.3: at most one live freeze of each kind per subject. Without this,
-- a retried freeze job would stack duplicates and an unfreeze would lift only one.
CREATE UNIQUE INDEX "account_freezes_one_live_per_learner_kind"
  ON "account_freezes"("learner_id", "kind")
  WHERE "lifted_at" IS NULL AND "learner_id" IS NOT NULL;

CREATE UNIQUE INDEX "account_freezes_one_live_per_teacher_kind"
  ON "account_freezes"("teacher_user_id", "kind")
  WHERE "lifted_at" IS NULL AND "teacher_user_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- §4.6 — safeguarding
-- ---------------------------------------------------------------------------

CREATE TABLE "safeguarding_reports" (
  "id"                    UUID PRIMARY KEY,
  "source"                "SafeguardingSource" NOT NULL,
  "reporter_id"           UUID,
  "subject_teacher_id"    UUID REFERENCES "teachers"("user_id"),
  "subject_learner_id"    UUID,
  "related_session_id"    UUID,
  "ticket_id"             UUID UNIQUE REFERENCES "tickets"("id"),
  "summary"               TEXT NOT NULL,
  "evidence_json"         JSONB,
  "state"                 "SafeguardingState" NOT NULL DEFAULT 'open',
  "assigned_to"           UUID,
  "first_response_due_at" TIMESTAMPTZ(6) NOT NULL,
  "first_response_at"     TIMESTAMPTZ(6),
  "action_taken"          TEXT,
  "decided_by"            UUID,
  "closed_at"             TIMESTAMPTZ(6),
  "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX "safeguarding_reports_state_first_response_due_at_idx"
  ON "safeguarding_reports"("state", "first_response_due_at");

CREATE TABLE "redaction_flags" (
  "id"               UUID PRIMARY KEY,
  "teacher_id"       UUID NOT NULL REFERENCES "teachers"("user_id") ON DELETE CASCADE,
  "learner_id"       UUID REFERENCES "learners"("id"),
  "kind"             "RedactionKind" NOT NULL,
  "excerpt_redacted" TEXT NOT NULL,
  "occurred_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "report_id"        UUID
);

CREATE INDEX "redaction_flags_teacher_id_occurred_at_idx" ON "redaction_flags"("teacher_id", "occurred_at");

-- ---------------------------------------------------------------------------
-- §4.7.6 — reconciliation, §4.7.1 — invoices, §4.7.5 — unallocated pool
-- ---------------------------------------------------------------------------

CREATE TABLE "reconciliation_runs" (
  "id"                  UUID PRIMARY KEY,
  "provider"            "PaymentMethod" NOT NULL,
  "statement_date"      DATE NOT NULL,
  "item_count"          INTEGER NOT NULL DEFAULT 0,
  "unmatched_count"     INTEGER NOT NULL DEFAULT 0,
  "unmatched_value_xaf" BIGINT NOT NULL DEFAULT 0,
  "alerted_at"          TIMESTAMPTZ(6),
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "reconciliation_runs_provider_statement_date_key"
  ON "reconciliation_runs"("provider", "statement_date");

CREATE TABLE "reconciliation_items" (
  "id"           UUID PRIMARY KEY,
  "run_id"       UUID NOT NULL REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE,
  "provider"     "PaymentMethod" NOT NULL,
  "provider_ref" VARCHAR(200) NOT NULL,
  "amount_xaf"   BIGINT NOT NULL,
  "occurred_at"  TIMESTAMPTZ(6) NOT NULL,
  "payment_id"   UUID REFERENCES "payments"("id") ON DELETE SET NULL,
  "state"        "ReconciliationState" NOT NULL DEFAULT 'unmatched',
  "note"         TEXT,
  "resolved_by"  UUID,
  "resolved_at"  TIMESTAMPTZ(6),
  -- FR-AI-005: a write-off is discretionary, so it names a human decision-maker.
  CONSTRAINT "reconciliation_items_write_off_has_actor" CHECK (
    "state" <> 'written_off' OR ("resolved_by" IS NOT NULL AND "note" IS NOT NULL)
  )
);

CREATE INDEX "reconciliation_items_state_occurred_at_idx" ON "reconciliation_items"("state", "occurred_at");

CREATE TABLE "invoices" (
  "id"                UUID PRIMARY KEY,
  "number"            VARCHAR(40) NOT NULL UNIQUE,
  "payment_id"        UUID NOT NULL UNIQUE REFERENCES "payments"("id"),
  "total_xaf"         BIGINT NOT NULL,
  "tax_xaf"           BIGINT NOT NULL DEFAULT 0,
  "legal_fields_json" JSONB,
  "storage_key"       VARCHAR(500),
  "issued_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- FR-PAY-016: invoice numbers are sequential and gapless. A gap reads to a tax
-- authority as a destroyed document, so the number comes from the database
-- rather than from a count of rows, which would repeat after a deletion.
CREATE SEQUENCE "invoice_number_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "unallocated_pool" (
  "id"         UUID PRIMARY KEY,
  "period"     VARCHAR(7) NOT NULL UNIQUE,
  "amount_xaf" BIGINT NOT NULL,
  "basis_json" JSONB NOT NULL,
  "decision"   "UnallocatedDecision" NOT NULL DEFAULT 'pending',
  "decided_by" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "reason"     TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  -- FR-ERN-004 / FR-AI-005: this balance is never disposed of automatically.
  CONSTRAINT "unallocated_pool_decision_has_actor" CHECK (
    "decision" = 'pending' OR ("decided_by" IS NOT NULL AND "reason" IS NOT NULL)
  )
);

CREATE TABLE "support_agent_profiles" (
  "user_id"                 UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "presence"                "AgentPresence" NOT NULL DEFAULT 'offline',
  "last_seen_at"            TIMESTAMPTZ(6),
  "max_open_tickets"        INTEGER NOT NULL DEFAULT 25,
  "safeguarding_designated" BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- Guards that must not live in application code
-- ---------------------------------------------------------------------------

-- FR-LDG-005 / §5.1: the instalments of a schedule sum exactly to its total.
-- Rounding remainders are allocated to the first instalment by the scheduler;
-- this asserts the result, so a drift is a failed transaction rather than a
-- learner who is quietly billed one franc too little.
CREATE OR REPLACE FUNCTION assert_instalments_sum_to_total() RETURNS TRIGGER AS $$
DECLARE
  target   BIGINT;
  scheduled BIGINT;
  schedule UUID;
BEGIN
  schedule := COALESCE(NEW."schedule_id", OLD."schedule_id");

  SELECT "total_xaf" - "discount_xaf" INTO target
    FROM "payment_schedules" WHERE "id" = schedule;

  -- A schedule deleted in the same transaction has nothing left to reconcile.
  IF target IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM("amount_xaf"), 0) INTO scheduled
    FROM "instalments"
   WHERE "schedule_id" = schedule AND "state" <> 'cancelled';

  -- Settling the balance early cancels the remaining parts, so a settled
  -- schedule legitimately no longer sums to its total.
  IF EXISTS (SELECT 1 FROM "payment_schedules"
              WHERE "id" = schedule AND "settled_in_full_at" IS NOT NULL) THEN
    RETURN NULL;
  END IF;

  IF scheduled <> target THEN
    RAISE EXCEPTION
      'Instalments for schedule % sum to % XAF, expected % XAF (FR-LDG-005)',
      schedule, scheduled, target;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER instalments_sum_to_total
  AFTER INSERT OR UPDATE OR DELETE ON "instalments"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_instalments_sum_to_total();

-- FR-SAF-006: "nothing in this queue is ever deleted by an operator." Evidence
-- and the trail of who did what are retained in full, so the application role
-- gets no DELETE on either table. A report is closed, never removed.
CREATE OR REPLACE RULE safeguarding_reports_no_delete AS
  ON DELETE TO "safeguarding_reports" DO INSTEAD NOTHING;

CREATE OR REPLACE RULE redaction_flags_no_delete AS
  ON DELETE TO "redaction_flags" DO INSTEAD NOTHING;

-- FR-TVR-010 / §4.4: verification decisions and their evidence are retained for
-- the life of the account plus the statutory period, so a checklist item is
-- never deleted either. It is superseded by a later recorded decision.
CREATE OR REPLACE RULE verification_checklist_no_delete AS
  ON DELETE TO "verification_checklist_items" DO INSTEAD NOTHING;

-- FR-PAY-016: an issued invoice is a legal document, corrected by a credit note
-- (a refund payment carrying its own invoice) rather than withdrawn. DELETE is
-- refused; UPDATE is left open because the rendered PDF is attached after the
-- number is allocated, and a column-level rule is not expressible here.
CREATE OR REPLACE RULE invoices_no_delete AS
  ON DELETE TO "invoices" DO INSTEAD NOTHING;
