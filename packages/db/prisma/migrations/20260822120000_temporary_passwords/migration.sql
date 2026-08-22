-- A password somebody else chose is not yet a credential.
--
-- An account created for a child -- by a parent, an admin or customer service --
-- starts with a password typed by an adult and delivered over SMS or email. It
-- has to be replaced before the account is meaningfully the child's own, and
-- "before anything else" is the requirement rather than "within some days", so
-- this is a flag cleared by the change itself rather than an expiry date.
--
-- Defaults false: every existing account was created by the person using it and
-- is unaffected.
ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- The guardian as written on the enrolment form, for a guardian who has no
-- account here.
--
-- `learner_guardians` remains the real relationship and is what carries access,
-- consent and billing. These two carry neither -- a name and a number a school
-- office has on paper, recorded because refusing to store it loses the only way
-- to reach the family. Nothing authenticates or authorises against them.
ALTER TABLE "learners"
  ADD COLUMN "guardian_name" VARCHAR(200),
  ADD COLUMN "guardian_contact" VARCHAR(200);
