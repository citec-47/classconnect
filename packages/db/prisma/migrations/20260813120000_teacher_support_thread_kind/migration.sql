-- A teacher writing to ClassConnect, and ClassConnect writing back.
--
-- The brief asks for messaging on the teacher dashboard "with the admin as
-- default", which is the same shape as the learner's support thread and not the
-- same conversation: `learner_support` is about a child, carries a `learner_id`
-- and is worked by the support queue under safeguarding rules. A teacher asking
-- about a payout belongs nowhere near that queue.
--
-- Deliberately alone in its own migration, following
-- `20260807140000_sixth_form_band_add_value`: PostgreSQL permits
-- `ALTER TYPE ... ADD VALUE` inside a transaction but forbids *using* the new
-- value in that same transaction, and Prisma runs one migration per transaction.

ALTER TYPE "MessageThreadKind" ADD VALUE IF NOT EXISTS 'teacher_support';
