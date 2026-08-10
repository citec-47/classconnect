-- An instalment may be settled by an Admin decision rather than a payment: a
-- correction, a waiver, a scholarship, or a record kept elsewhere.
--
-- Recorded on the row itself, so the instalment says how it reached its state
-- rather than leaving that only in the audit log. The balancing ledger entry
-- still carries the money side (FR-LDG-001/002).
ALTER TABLE "instalments"
  ADD COLUMN "adjusted_by" UUID,
  ADD COLUMN "adjustment_reason" VARCHAR(500);
