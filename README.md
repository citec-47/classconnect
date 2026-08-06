# ClassConnect

Online learning platform for Cameroon — connecting verified teachers with primary,
secondary, high-school and adult learners for live classes, homework support and
GCE examination preparation.

Built to **SRS-CC-CM-001 v1.0** (ISO/IEC/IEEE 29148:2018). Every non-obvious rule
in this codebase cites the requirement that fixes it; if you change behaviour,
change the citation or challenge the requirement.

---

## What is built

This is the **foundation plus the identity vertical slice** of the Phase 1 MVP
(§8). It runs end to end: you can register, verify a phone, create children,
apply to teach, and approve a teacher through a real admin queue.

| Area | Requirements | State |
|---|---|---|
| Data model — all 27 entities of §5.1 | DAT-001..007, DAT-010/011 | Complete, migrated |
| Registration & authentication | FR-AUT-002..010 | Complete |
| **Admin-created Student and Teacher accounts** | see below | Complete |
| Roles, permissions, record-level ownership, audit | FR-RBA-001..005 | Complete |
| Parent–child accounts | FR-FAM-001..006 | Complete |
| Levels, subjects, teacher directory | FR-PRO-001..006 | Complete |
| Teacher verification | FR-TVR-003..010 | Complete |
| Credential document upload | SI-006, FR-TVR-002, FR-FIL-001..005 | Complete; **blocked on a Cloudinary API-key permission** (see below) |
| Notifications | FR-NOT-001..008 | Catalogue + recording complete; **no transport** (see below) |
| Bilingual EN/FR | NFR-LOC-001..005 | Complete, compiler-enforced |
| Scheduling, live class, coursework, assessment, GCE, payments, ledger, earnings, support, ratings, reporting | §4.4–4.9, §4.12–4.15 | **Not built** — schema and config keys in place |

### Who can create an account — a deliberate departure from the SRS

The product owner decided that **only an Admin creates Student and Teacher
accounts**. That contradicts two requirements as written, and the departure is
recorded here rather than hidden:

- **FR-AUT-001** allowed self-registration as Parent, Adult Learner *or*
  Teacher. Teacher is withdrawn. The role is not expressible in the
  registration DTO, so the restriction cannot be bypassed by crafting a request.
- **FR-TVR-001/002** described a teacher self-application that an Admin then
  reviewed. There is no application; the Admin enters the teacher's details.

What is deliberately **kept**:

- Parents and Adult Learners still register themselves. They are the payers, and
  closing that path would put every new customer behind staff time — OI-10
  already names that as the binding constraint on growth.
- **FR-TVR-005 survives intact.** Approval still requires an Admin to
  affirmatively record every mandatory checklist item. Because the Admin is now
  also the creator, the checklist is part of the creation form: submit it
  complete and the teacher is approved; submit it partial and the account is
  created `under_review`, which FR-TVR-003 keeps unlistable, unassignable and
  unpaid. Creating an account is not the same as vouching for one.
- **FR-TVR-010** — the deciding Admin, the evidence and the findings are still
  retained, and `teachers.created_by` / `learners.created_by` now record who
  brought each account into existence.

**School types.** The Admin chooses primary school (Class 1–6) or secondary
school (Form 1–5, Lower Sixth, Upper Sixth), then the class, then the subjects.
FR-PRO-001's full taxonomy is unchanged underneath — the GCE O/L, A/L and Adult
GCE tracks group under secondary, since a learner sitting GCE O/L is a
secondary-school learner rather than a third school type.

Two rules are enforced server-side, not just hidden in the UI: the class must
belong to the chosen school type, and a subject must actually be taught at that
class (FR-PRO-002). Without the second, a Class 2 pupil could be enrolled in
A-Level Further Maths.

### Deliberately not faked

Three things are wired to a seam and left unimplemented rather than stubbed with
something that looks like it works:

- **Notification delivery (SI-007/008/009).** AS-03 and AS-04 are unmet — no SMS
  aggregator or WhatsApp provider is contracted. `NotificationsService` records
  every notification row and logs the intent; `deliver()` is the drop-in point.
  In development the OTP is returned in the API response so the flow is usable.
- **Malware scanning (FR-FIL-001).** No anti-malware provider is contracted, so
  nothing can honestly report a file as clean. `MalwareScanService` implements
  the quarantine state machine and a provider seam; `FILE_SCAN_MODE=enforce`
  (required in production) leaves an unscanned file stored but **not
  downloadable**, which is the correct failure for this control. A provider
  outage yields `pending`, never `clean`.
- **Payments.** The ledger schema, its append-only enforcement and the money
  arithmetic are done and tested. No provider integration exists, and OI-02/OI-03
  must be resolved before it should be built.

### File upload — one console change outstanding

The three-step handshake is implemented and verified: the API refuses a
disallowed file before signing anything, signs a scope limited to one asset
path, and confirms against what Cloudinary reports rather than what the client
claimed. Uploads use `type: authenticated`, so FR-FIL-003 holds by construction
— the asset has no permanent public URL, and reads go through short-lived
signed URLs carrying `fl_strip_profile` (FR-FIL-004).

Cloudinary currently refuses every upload with:

```
Request forbidden due to missing permissions (actions=["create"])
```

The key authenticates (`/ping` succeeds), so the credentials are right and
nothing in this repository needs to change. Two things to fix in the console:

1. Grant the API key the **`create`** and **`read`** actions on the product
   environment — Settings → API Keys. `read` is needed too: the confirmation
   step calls the Admin API to check what was actually stored.
2. Confirm the **`classconnect` upload preset was saved**. Listing presets with
   this key returns an empty set, which suggests the "Add upload preset" form
   was not submitted. It must be in **Signed** mode.

`node apps/api/test/e2e/file-upload.e2e.mjs` re-checks the whole path and prints
this diagnosis if the permission is still missing.

---

## Running it

### Prerequisites

Node.js 20.11+ and either Docker or the no-Docker fallback below.

### 1. Configuration

```bash
cp .env.example .env
```

Then generate real secrets — the API refuses to start in production with the
placeholders (`NFR-SEC-007`):

```bash
node -e "console.log('JWT_ACCESS_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('JWT_REFRESH_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('FIELD_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Database

PostgreSQL 16 and Redis 7, per §2.4. Either a managed instance (set
`DATABASE_URL`) or locally:

```bash
npm run db:up          # docker compose up -d postgres redis
```

**Without Docker** (Windows workstations where Docker Desktop is unavailable) —
runs the official PostgreSQL binaries as a child process on the same port and
credentials, so `DATABASE_URL` is unchanged:

```bash
node packages/db/scripts/local-postgres.mjs start
```

Development only. It is not a deployment mechanism.

### 3. Migrate and seed

```bash
npm run db:generate
npm run db:migrate
npm run db:seed        # DAT-011: levels, subjects, plans, templates, FAQ — EN and FR
```

The second migration (`append_only`) installs the DAT-005 / FR-LDG-001
protections: `ledger_entries` and `audit_log` reject UPDATE and DELETE at the
database, a deferred trigger asserts every ledger transaction nets to zero, and
partial unique indexes prevent learner double-booking and overlapping active
subscriptions.

### 4. Create the first administrator

There is no self-service admin registration. NFR-SEC-012 requires named
individuals, and FR-AUT-009 requires MFA, so the account is provisioned at the
console with MFA enrolled:

```bash
node packages/db/scripts/create-admin.mjs "Full Name" you@example.com 'a-long-password' admin_ops
```

It prints a TOTP secret and an `otpauth://` URI. Add it to an authenticator app
— the account cannot sign in without it.

### 5. Run

```bash
npm run dev            # API on :4000, web on :3000
```

Open <http://localhost:3000> — it redirects to `/en` or `/fr` based on your
browser's `Accept-Language` (NFR-LOC-003).

---

## Testing

```bash
npm test                              # unit tests
npm run test:cov --workspace @classconnect/api

# End-to-end, against a running API, database and object storage:
node apps/api/test/e2e/core-flows.e2e.mjs                      # 35 checks
node apps/api/test/e2e/verification.e2e.mjs <TOTP_SECRET>      # 25 checks
node apps/api/test/e2e/admin-accounts.e2e.mjs <TOTP_SECRET>    # 39 checks
node apps/api/test/e2e/file-upload.e2e.mjs                     # blocked, see above
```

**Coverage does not meet NFR-MNT-002** (80% overall, 95% on payment, ledger,
earnings, authorisation and safeguarding). The domain rules are unit tested —
104 tests covering money arithmetic, roles and permissions, TOTP, file policy,
age derivation, wire contracts and catalogue completeness — but the Nest service
layer is covered only by the end-to-end suites, which jest does not instrument.
`jest.config.js` documents the gap and pins the current floor so it cannot
regress. Closing it means in-process integration tests against a throwaway
database.

What the end-to-end checks verify, live against Neon and Cloudinary:

- FR-AUT-002/004 — OTP issued, wrong code counts down remaining attempts,
  correct code signs in, replay of a used code fails
- FR-AUT-006 — access token TTL ≤ 15 min, rotating refresh token
- FR-AUT-009 — admin sign-in refused without MFA, refused with a wrong TOTP,
  accepted with a valid one
- FR-RBA-002 — unauthenticated and under-privileged requests refused
- FR-RBA-003 — a second parent can neither read nor write another's child, and
  list endpoints are scoped to owned records
- FR-FAM-006 — minor status derived from date of birth, both directions
- FR-TVR-005 — **approval refused until every mandatory checklist item is
  recorded**, and the refusal names what is missing
- FR-TVR-003 — an unapproved, and later a suspended, teacher is not listable
- FR-PRO-005 / NFR-SEC-003 — identity and payout details never leave the API in
  clear, in either the admin or the public view
- FR-FIL-002 — `.exe`, `.zip`, a mismatched extension and type, and an
  over-size file are all refused *before* an upload is signed
- FR-FIL-003 — the signature scopes an upload to one owner-derived path,
  `type=authenticated` is enforced, and the API secret never reaches the client
- FR-FIL-001 — an unscanned file is refused for download, to everyone
- FR-RBA-003 — a second teacher, and an anonymous caller, are both refused a
  document download URL
- Account creation is Admin-only — self-registration as a student or teacher is
  refused, a parent is refused `student:create`, and the old parent add-child
  endpoint returns 403
- School types partition the catalogue, a class outside the chosen school is
  refused, and so is a subject not taught at that class
- A malformed id returns a client error rather than a 500

---

## Layout

```
packages/shared     Roles and permissions, money arithmetic, phone normalisation,
                    configuration keys with SRS defaults, wire contracts (zod),
                    EN/FR message catalogues
packages/db         Prisma schema for §5.1, migrations, seed data, dev scripts
apps/api            NestJS — auth, RBAC, audit, family, catalogue, teachers,
                    notifications
apps/web            Next.js PWA — bilingual, mobile-first at 360px, WCAG 2.1 AA
```

### Decisions worth knowing

- **The landing page shows rather than tells.** The hero carries a real
  verification record — the six checks from `VERIFICATION_CHECKLIST` — instead
  of an illustration, and every claim on the page maps to behaviour the system
  has: the prices are FR-PAY-002, the levels FR-PRO-001, the degradation ladder
  FR-LIV-009. No images, no web fonts, no animation library; the only assets are
  inline SVGs, so it costs the §6.1 budget almost nothing. Headings are set in a
  system serif and body in a system sans, which gives the page a voice without a
  font request. Verified at 360, 414, 768 and 1280 CSS pixels with no horizontal
  overflow at any width.
- **Transactions assume a remote database.** Prisma defaults to a 5s interactive
  transaction timeout, which suits a local database and not managed hosting.
  Registration writes five rows in one transaction and measured 6.6s against a
  cold Neon instance, which surfaced as an intermittent 500 on sign-up. The
  ceilings are raised in `PrismaService`; NFR-PER-003's latency target is
  unchanged.
- **Money is never a float.** `BIGINT` whole XAF everywhere (CON-02), and all
  arithmetic goes through `packages/shared/src/money.ts`. `splitProportionally`
  allocates rounding remainders by largest-remainder so a split always sums
  exactly to its source (FR-LDG-005) — tested against 800 awkward splits.
- **Authorisation is default-deny.** The permissions guard is global; an
  endpoint with no decorator still requires a user. Role reach is a permission
  table; per-record access is a separate service, so ownership logic cannot
  drift into controllers.
- **Bulk approval is not expressible.** FR-TVR-005 is enforced by the shape of
  the API, not by a validation rule: the decision endpoint takes one applicant
  and their checklist, and refuses approval unless every mandatory item is true.
- **French is compiler-enforced.** The `Messages` type widens the English
  catalogue's literals, so a missing or misspelled French key fails the build
  while a genuine translation passes. A test also asserts no French string is
  merely a copy of the English (§9.2 criterion 8).
- **Fail closed.** An admin with no MFA enrolled cannot sign in. `DEV_EXPOSE_OTP`
  aborts boot in production.

---

## Open issues that block further build

These come from §10 and are not engineering choices:

| ID | Blocks | Why it matters here |
|---|---|---|
| **OI-03** | Payments, entitlements | Plan prices are seeded from FR-PAY-002; what they *entitle* a learner to is undefined. The seeded entitlements are marked `_provisional` in the database. FR-PAY-006 cannot be built until this is decided. |
| **OI-02** | Earnings, payouts | The 60/40 share and subscription pricing are not directly compatible. §4.9.4's attended-minute model is implemented as configuration (`earnings.*`), not hard-coded, but must be commercially confirmed. |
| **OI-04** | Live classroom | LiveKit vs Zoom SDK. `sessions.room_id` and the attendance model assume server-side join/leave events either way. |
| **OI-07** | Invoicing, hosting, payouts | Data-protection law, VAT, withholding, contractor status. Affects `retention.*` defaults and the hosting decision. |
| **OI-05** | GCE library | `past_papers.rights_status` defaults to `unverified` and `publishable` to false, so nothing can be published without a recorded right (FR-GCE-007). |

---

## Not yet done, in priority order

1. Integration tests to reach NFR-MNT-002 coverage.
2. File upload with virus scanning (SI-006, FR-FIL-001..005) — completes FR-TVR-002.
3. Notification transports once AS-03/AS-04 are met.
4. Scheduling and booking (§4.4), then the live classroom (§4.5) once OI-04 is decided.
5. Payments and ledger (§4.9) once OI-02 and OI-03 are decided.
6. Safeguarding controls (§4.10) — the schema supports them; the enforcement
   points sit inside the messaging and session modules, which do not exist yet.

**§4.10 is not implemented.** The SRS puts safeguarding at the same priority as
payment integrity, and this build honours the parts that exist today (minors'
data is guardian-consented and access-controlled, teacher payout and identity
details are never exposed, and every staff read of a learner is audited). The
rest — in-platform-only messaging, contact-detail redaction, report-a-concern —
depends on modules not yet built and must land with them, not after.
