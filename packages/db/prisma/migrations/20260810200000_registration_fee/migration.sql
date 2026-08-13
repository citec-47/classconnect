-- Registration is a separate debt from tuition.
--
-- A family pays to enrol, then pays to be taught. Folding the first into the
-- instalments made "Part 1" mean two different things and left the plan total
-- unexplainable to the person paying it.
--
-- `total_xaf` continues to mean tuition — the amount the instalments split.
-- Existing rows default to a zero registration fee, so nothing already recorded
-- changes value.
ALTER TABLE "payment_schedules"
  ADD COLUMN "registration_fee_xaf" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "registration_paid_at" TIMESTAMPTZ(6);
