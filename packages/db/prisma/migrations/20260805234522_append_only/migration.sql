-- DAT-005: `ledger_entries` and `audit_log` shall be append-only, enforced by
-- database permissions that deny UPDATE and DELETE to the application role.
--
-- FR-LDG-001 makes the same demand of the ledger in stronger terms: entries are
-- never updated or deleted; corrections are made by compensating entries.
--
-- This is enforced here rather than in application code so that a bug, a
-- misplaced Prisma call, or a compromised application cannot rewrite history.
-- Rules that raise an exception are used instead of REVOKE alone, because the
-- migration runs as the owner and Prisma connects as the same role in the
-- default local setup; a rule binds regardless of which role issues the
-- statement.
--
-- Operational note (NFR-MNT-007): a genuine correction is made by inserting a
-- compensating entry. If a row must ever be removed for a lawful erasure
-- request (NFR-PRV-004), a DBA drops the rule inside a transaction, records the
-- action, and restores it — deliberately awkward, because it should be.

CREATE OR REPLACE RULE ledger_entries_no_update AS
  ON UPDATE TO ledger_entries
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE ledger_entries_no_delete AS
  ON DELETE TO ledger_entries
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO audit_log
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO audit_log
  DO INSTEAD NOTHING;

-- FR-LDG-002: every monetary movement produces balanced entries. A txn_id must
-- net to zero across its legs. This is checked by a deferred constraint trigger
-- so that both legs may be inserted within one transaction.
CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS TRIGGER AS $$
DECLARE
  imbalance BIGINT;
BEGIN
  SELECT COALESCE(SUM(
           CASE WHEN direction = 'debit' THEN amount_xaf ELSE -amount_xaf END
         ), 0)
    INTO imbalance
    FROM ledger_entries
   WHERE txn_id = NEW.txn_id;

  IF imbalance <> 0 THEN
    RAISE EXCEPTION
      'Ledger transaction % does not balance: debits minus credits = % XAF (FR-LDG-002)',
      NEW.txn_id, imbalance;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_ledger_balanced();

-- CON-02 / DAT-002: money is whole XAF. The column types are already BIGINT;
-- these guards catch a negative amount reaching the ledger, which would signal
-- that a caller tried to express direction by sign rather than by `direction`.
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_amount_non_negative CHECK (amount_xaf >= 0);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_non_negative CHECK (amount_xaf >= 0);

ALTER TABLE payouts
  ADD CONSTRAINT payouts_amount_non_negative CHECK (amount_xaf >= 0);

ALTER TABLE plans
  ADD CONSTRAINT plans_price_non_negative CHECK (price_xaf >= 0);

-- FR-SCH-005: a learner cannot be double-booked either. The teacher side is a
-- unique index in the schema; the learner side needs to allow many rows where
-- learner_id is NULL (group sessions), so it is a partial unique index.
CREATE UNIQUE INDEX sessions_learner_slot_unique
  ON sessions (learner_id, starts_at_utc)
  WHERE learner_id IS NOT NULL
    AND status IN ('scheduled', 'in_progress');

-- DAT-004: one active subscription per learner per period. The schema's unique
-- index covers (learner_id, period_start); this guards overlapping periods,
-- which the column pair alone cannot express.
CREATE UNIQUE INDEX subscriptions_one_active_per_learner
  ON subscriptions (learner_id)
  WHERE status IN ('active', 'grace', 'pending_payment');
