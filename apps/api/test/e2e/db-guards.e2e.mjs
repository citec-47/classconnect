/**
 * Database-level guards.
 *
 * §8 requires several protections to be "verified by test, not by inspection":
 *
 *   "Ledger and audit tables reject UPDATE and DELETE from the application
 *    database role — verified by test, not by inspection."
 *
 * They cannot be unit tested, because the thing under test is the database
 * itself — a rule, a constraint trigger, a check constraint. Application code
 * has no say in whether they hold, which is exactly why they were put there.
 *
 * Run against a database that has had every migration applied:
 *
 *   npm run db:local                       # in another terminal
 *   npm run db:migrate
 *   node apps/api/test/e2e/db-guards.e2e.mjs
 *
 * Safe to run against a development database: every row it writes is either
 * rolled back or is a marked test row it then proves it cannot delete. Do not
 * point it at production — not because it is destructive, but because it
 * deliberately leaves undeletable rows in the audit and safeguarding tables.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const results = [];

const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against a production database.');
  }

  // --- The admin surface's tables exist -------------------------------------
  const expected = [
    'payment_schedules', 'instalments', 'account_freezes',
    'safeguarding_reports', 'redaction_flags',
    'reconciliation_runs', 'reconciliation_items',
    'invoices', 'unallocated_pool', 'support_agent_profiles',
  ];
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`,
    expected,
  );
  check('admin tables created', tables.length === expected.length,
    `${tables.length}/${expected.length}`);

  // --- FR-PAY-016: invoice numbers are sequential and gapless ---------------
  // A gap reads to a tax authority as a destroyed document, so the number comes
  // from a sequence rather than from a count of rows.
  const [{ nextval: first }] = await prisma.$queryRawUnsafe(`SELECT nextval('invoice_number_seq')`);
  const [{ nextval: second }] = await prisma.$queryRawUnsafe(`SELECT nextval('invoice_number_seq')`);
  check('FR-PAY-016 invoice sequence is gapless', second - first === 1n, `${first} -> ${second}`);

  // --- FR-SAF-006: "nothing in this queue is ever deleted by an operator" ----
  const reportId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO safeguarding_reports (id, source, summary, first_response_due_at)
     VALUES ($1::uuid, 'other', 'db-guards e2e probe', NOW() + interval '4 hours')`,
    reportId,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM safeguarding_reports WHERE id = $1::uuid`, reportId);
  const report = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM safeguarding_reports WHERE id = $1::uuid`, reportId);
  check('FR-SAF-006 safeguarding evidence survives DELETE', report.length === 1);

  // --- DAT-005 / FR-LDG-001: the audit log is append-only -------------------
  const auditId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO audit_log (id, action, entity, occurred_at)
     VALUES ($1::uuid, 'db_guards.probe', 'test', NOW())`, auditId);
  await prisma.$executeRawUnsafe(`DELETE FROM audit_log WHERE id = $1::uuid`, auditId);
  await prisma.$executeRawUnsafe(
    `UPDATE audit_log SET action = 'tampered' WHERE id = $1::uuid`, auditId);
  const audit = await prisma.$queryRawUnsafe(
    `SELECT action FROM audit_log WHERE id = $1::uuid`, auditId);
  check('DAT-005 audit_log rejects DELETE', audit.length === 1);
  check('DAT-005 audit_log rejects UPDATE', audit[0]?.action === 'db_guards.probe',
    `action is "${audit[0]?.action}"`);

  // --- DAT-005: the ledger is append-only ----------------------------------
  // Written inside a balanced transaction so the row survives to be tampered
  // with; an unbalanced one would be refused before we could test the rules.
  const ledgerTxn = randomUUID();
  const debitId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO ledger_entries (id, txn_id, account, direction, amount_xaf, occurred_at)
       VALUES ($1::uuid, $2::uuid, 'cash:mtn_momo', 'debit', 1000, NOW())`, debitId, ledgerTxn);
    await tx.$executeRawUnsafe(
      `INSERT INTO ledger_entries (id, txn_id, account, direction, amount_xaf, occurred_at)
       VALUES ($1::uuid, $2::uuid, 'liability:deferred_revenue', 'credit', 1000, NOW())`,
      randomUUID(), ledgerTxn);
  });
  await prisma.$executeRawUnsafe(`DELETE FROM ledger_entries WHERE id = $1::uuid`, debitId);
  await prisma.$executeRawUnsafe(
    `UPDATE ledger_entries SET amount_xaf = 999999 WHERE id = $1::uuid`, debitId);
  const ledger = await prisma.$queryRawUnsafe(
    `SELECT amount_xaf FROM ledger_entries WHERE id = $1::uuid`, debitId);
  check('DAT-005 ledger_entries rejects DELETE', ledger.length === 1);
  check('DAT-005 ledger_entries rejects UPDATE', ledger[0]?.amount_xaf === 1000n,
    `amount is ${ledger[0]?.amount_xaf}`);

  // --- FR-LDG-002: every transaction nets to zero ---------------------------
  let unbalancedRefused = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO ledger_entries (id, txn_id, account, direction, amount_xaf, occurred_at)
         VALUES ($1::uuid, $2::uuid, 'cash:mtn_momo', 'debit', 1000, NOW())`,
        randomUUID(), randomUUID());
      // No matching credit. The deferred constraint trigger refuses at COMMIT.
    });
  } catch {
    unbalancedRefused = true;
  }
  check('FR-LDG-002 an unbalanced transaction is refused', unbalancedRefused);

  // --- §5.3: an automatic freeze names the instalment that caused it --------
  const learner = await prisma.$queryRawUnsafe(`SELECT id FROM learners LIMIT 1`);
  if (learner.length === 0) {
    console.log('SKIP  §5.3 automatic-freeze constraint — no learner row; run npm run db:seed');
  } else {
    let refused = false;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO account_freezes (id, scope, learner_id, kind, category, reason, effective_from)
         VALUES ($1::uuid, 'learner', $2::uuid, 'automatic', 'non_payment', 'probe', NOW())`,
        randomUUID(), learner[0].id);
    } catch {
      refused = true;
    }
    check('§5.3 an automatic freeze without a triggering instalment is refused', refused);
  }

  // --- FR-LDG-005: instalments sum exactly to the schedule total ------------
  const subscription = await prisma.$queryRawUnsafe(`SELECT id FROM subscriptions LIMIT 1`);
  if (subscription.length === 0) {
    console.log('SKIP  FR-LDG-005 instalment sum trigger — no subscription row; run npm run db:seed');
  } else {
    let driftRefused = false;
    try {
      await prisma.$transaction(async (tx) => {
        const scheduleId = randomUUID();
        await tx.$executeRawUnsafe(
          `INSERT INTO payment_schedules (id, subscription_id, plan_type, total_xaf)
           VALUES ($1::uuid, $2::uuid, 'three_instalments', 30000)`,
          scheduleId, subscription[0].id);
        // 10 000 + 10 000 = 20 000, one instalment short of the 30 000 total.
        for (const [sequence, amount] of [[1, 10000], [2, 10000]]) {
          await tx.$executeRawUnsafe(
            `INSERT INTO instalments (id, schedule_id, sequence, amount_xaf, due_on)
             VALUES ($1::uuid, $2::uuid, $3, $4, CURRENT_DATE)`,
            randomUUID(), scheduleId, sequence, amount);
        }
      });
    } catch {
      driftRefused = true;
    }
    check('FR-LDG-005 instalments that do not sum to the total are refused', driftRefused);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} guards verified`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('ERROR', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
