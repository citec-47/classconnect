-- Adds `sixth_form` as a third teaching band.
--
-- Deliberately alone in its own migration. PostgreSQL permits
-- `ALTER TYPE ... ADD VALUE` inside a transaction, but it will not allow the
-- new value to be *used* in that same transaction — the next statement to
-- reference it fails with "unsafe use of new value of enum type". Prisma runs
-- each migration file in one transaction, so the backfill that follows lives in
-- the next migration rather than below this line.

ALTER TYPE "SchoolType" ADD VALUE IF NOT EXISTS 'sixth_form';
