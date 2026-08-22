# Deploying ClassConnect

One Vercel project, plus a managed PostgreSQL. The frontend is served at
`https://<project>.vercel.app`; the Nest API is served from the very same
deployment at `https://<project>.vercel.app/api/v1`. No Docker anywhere — not
in development, not in CI, not in production.

The other supported shape is a web service and an API service side by side, on a
host that keeps a process alive — Render, Railway, Fly. §1 is the same either
way; §2 covers the single project and §2a covers the pair.

---

## 1. The database

Any managed PostgreSQL 15+ works. Neon is what this repository is configured
against; Supabase and Vercel Postgres are equivalent.

You need **two** connection strings to the same database:

| Variable | Which connection | Why |
| --- | --- | --- |
| `DATABASE_URL` | **Pooled** | Every serverless instance opens its own connections. Without a pooler, a platform that scales out exhausts a small Postgres's connection limit within minutes. |
| `DIRECT_DATABASE_URL` | **Direct** | `prisma migrate` takes an advisory lock and runs DDL. Neither survives PgBouncer's transaction mode — against the pooled host, migrations hang or fail with *"prepared statement already exists"*. |

On Neon the pooled host carries `-pooler` in its name and the direct one does
not. Everything else about the two strings is identical.

Prisma requires `DIRECT_DATABASE_URL` to be set whenever the schema declares
`directUrl` — including locally, where it should simply equal `DATABASE_URL`.

### Apply the migrations

From a machine that holds `DIRECT_DATABASE_URL` — **not** from the Vercel build:

```bash
npm run db:migrate
npm run db:seed        # first deploy only: levels, subjects, plans, templates
```

This is deliberately not part of `vercel-build`. A build runs on every preview
deployment and again on every rollback; migrations must be applied once,
deliberately, against a known target.

---

## 2. The Vercel project

Use the existing frontend project; do **not** create a second API project.
Set its **Root Directory** to `apps/web` and enable **Include files outside the
root directory**. The web build compiles the Nest app first, then Next bundles
the same-origin API bridge at `pages/api/v1/[...path].ts`.

`apps/web/vercel.json` sets the API function's 30-second duration and the daily
billing cron. Configure the environment values below in this one project.

| Additional variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api/v1` â€” same-origin API base, baked into the frontend at build time. |

`NEXT_PUBLIC_API_URL` is read at build time, so changing it requires a
redeploy. Keeping it `/api/v1` avoids a second deployment URL and CORS boundary.

### Required environment variables

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Pooled. |
| `DIRECT_DATABASE_URL` | Direct. |
| `JWT_ACCESS_SECRET` | 48 random bytes. Boot refuses the template placeholder. |
| `JWT_REFRESH_SECRET` | A *different* 48 random bytes. |
| `FIELD_ENCRYPTION_KEY` | 32 random bytes, base64. NFR-SEC-003. |
| `CLOUDINARY_API_SECRET` + name, key, preset | SI-006. Boot refuses without the secret. |
| `WEB_ORIGIN` | The exact web origin, e.g. `https://classconnect.vercel.app`. Boot refuses if it is missing or still says `localhost`. |
| `CRON_SECRET` | Authenticates the scheduled billing pass. Setting it also makes Vercel attach it to cron calls automatically. |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT x2
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"     # FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # CRON_SECRET
```

Do **not** carry `DEV_EXPOSE_OTP`, `DEV_DISABLE_STAFF_MFA` or
`FILE_SCAN_MODE=bypass_dev` across. The API refuses to start with any of them on
deployed infrastructure, which is the point — a pasted-in laptop environment
file fails loudly instead of quietly handing out one-time codes.

---

## 2a. Two services instead of one — Render, Railway, Fly

The layout above puts the frontend and the API in one deployment. The other
shape is a web service and an API service side by side, which is what the Render
deployment does. Everything in §1 still applies; what changes is how the browser
reaches the API.

There are two ways, and the second exists because the first is easy to get
wrong.

### The API behind the frontend's own origin — `API_ORIGIN`

Set one variable on the **web** service:

| Variable | Value |
| --- | --- |
| `API_ORIGIN` | The API service's URL, e.g. `https://classconnect-api.onrender.com`. The `/api/v1` suffix is optional; only the origin is used. |

`apps/web/src/pages/api/v1/[...path].ts` then streams every `/api/v1` request to
that service and streams the answer back. The browser only ever talks to the web
origin.

This is the recommended shape, for three reasons that are all about failure
modes rather than elegance:

- **It is read at run time.** Setting it takes effect on restart, with no
  rebuild. `NEXT_PUBLIC_API_URL` is inlined into the client bundle *and* into the
  CSP when the frontend is compiled, so with that route the value has to be
  correct before the build, and a wrong one is invisible until someone tries to
  sign in.
- **No second origin.** No CORS preflight, and `connect-src 'self'` already
  covers it, so the CSP needs nothing.
- **It tolerates the value being written badly.** A leading `API_ORIGIN=`, shell
  quotes, surrounding whitespace and a trailing `/api/v1` are all absorbed.
  Those four are pinned by `apps/web/src/lib/api-origin.spec.ts` because each
  one has cost this deployment real time.

The API service itself still needs `WEB_ORIGIN` set to the web service's origin,
and its own database and secret variables from §2.

### The API addressed directly — `NEXT_PUBLIC_API_URL`

Set `NEXT_PUBLIC_API_URL` on the web service to the full base —
`https://classconnect-api.onrender.com/api/v1` — and **redeploy**, because it is
compiled in. The browser then calls the API service directly, and CORS admits it
because `WEB_ORIGIN` names the frontend.

The one thing this buys is the **push channel**. A WebSocket upgrade never
reaches a Next API route, so the admin badge stream cannot travel through
`API_ORIGIN`. The bridge marks forwarded requests with `x-cc-api-bridge`, and
`DashboardService.navFor` returns `pushEnabled: false` when it sees one — so the
client uses COM-003's 60-second poll instead of opening a socket that would fail
and retry for the rest of the session. Same trade-off as §3 below, arrived at
from a different direction.

Both variables may be set at once. `API_ORIGIN` wins for anything that reaches
the bridge, and a bundle built with `NEXT_PUBLIC_API_URL` bypasses the bridge
entirely, so the two agree as long as they name the same API.

### If sign-in returns 503

That status comes from the bridge, and it means the frontend answered the call
itself rather than passing it on — `API_ORIGIN` and `NEXT_PUBLIC_API_URL` are
both unset or relative, so the web service tried to boot the whole API
in-process, without a database. It is not a statement about the API service,
which is usually healthy at the time. Check it separately:

```bash
curl https://<api-service>.onrender.com/api/v1/jobs/health
```

The web service's log says the same thing in words, once per boot, and names the
way out.

---

## 3. What changes on serverless

Two things behave differently on Vercel than on a long-running host. Both are
handled; neither is a silent degradation.

### Badge counts poll instead of pushing

§3 specifies live sidebar badges over a WebSocket, reconciled by a poll every
60 seconds (COM-002 / COM-003).

A serverless function is invoked per request and frozen immediately after, so it
cannot hold a socket open. `GET /admin/nav` therefore returns `pushEnabled:
false` on Vercel and the client does not attempt a connection — rather than
failing, backing off and retrying for the whole session.

The 60-second poll is the authoritative path in **both** deployments, so this is
a latency difference, not a lost feature: a badge is correct within a minute
instead of immediately. Four operators working the same queue will occasionally
open an item another has just actioned; the API refuses the second decision
(`errors.approval.already_decided`), so the outcome is correct either way.

To get instant push back, run `apps/api` on a host that keeps a process alive —
Render, Railway, Fly — and set `NEXT_PUBLIC_API_URL` at it. Nothing else changes:
`main.ts` and the Vercel entry point build the same application from
`create-app.ts`.

### The billing pass runs from Cron

§5.3 needs a daily pass: mark instalments due and overdue, send the FR-PAY-019
notices at 7 / 3 / 1 / 0 days, then freeze anything past its grace period.

On a long-running host `BillingSchedulerService` does this hourly on a timer. On
Vercel there is no timer, so `vercel.json` declares a cron that calls
`GET /api/v1/jobs/billing-pass` at 05:00 UTC — 06:00 in Africa/Douala, early
enough that a payer who acts on a notice has the whole working day.

The endpoint is `@Public()` because cron has no user session, but it is not
unauthenticated: it requires `CRON_SECRET` as a bearer token, compared in
constant time. Without that, freezing a learner's account would be available to
anyone who guessed the URL.

The pass is idempotent — notices carry a per-instalment key and the freeze is
guarded by a partial unique index — so an at-least-once cron delivery, or a
retry after a timeout, sends nothing twice and freezes nobody twice.

Check it is wired up:

```bash
curl https://<project>.vercel.app/api/v1/jobs/health
# {"ok":true,"mode":"scheduled","cronSecretConfigured":true}
```

Run it by hand, or replay a day the schedule missed:

```bash
curl -X POST https://<project>.vercel.app/api/v1/jobs/billing-pass \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST "https://<project>.vercel.app/api/v1/jobs/billing-pass?asOf=2026-09-04" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 4. Known limitations of this topology

Stated plainly rather than discovered later.

**Rate limiting is per-instance.** `ThrottlerModule` keeps its counters in
memory, and each serverless instance has its own. NFR-AVL-007's per-IP limits are
therefore looser than they look under load. The limits that carry real security
weight are unaffected: FR-AUT-004's per-number OTP limits are enforced in the
database by `OtpService`, precisely because they must be per-number and must
survive a restart. Closing the gap properly means a shared counter store
(Upstash Redis) behind a custom `ThrottlerStorage`.

**Reports read the primary.** FR-RPT-006 wants reporting queries on a read
replica. `PrismaService` is the seam — a second client pointed at a replica URL,
used by `DashboardService.operational/money` and `GovernanceService`. Until one
is provisioned, a heavy report competes with live traffic.

**Cold starts.** A first request after an idle period pays for Nest
construction plus a Neon compute wake. `connect_timeout=30` in the connection
string and `maxDuration: 30` in `vercel.json` exist to survive that; NFR-PER-003's
600ms P95 applies to a warm instance. Neon's scale-to-zero can be disabled if
the first-request latency matters more than the idle cost.

**File uploads pass through the function.** Vercel caps a serverless request
body at 4.5 MB, and FR-FIL-003 allows documents up to 10 MB. Uploads go directly
to Cloudinary with a server-signed payload, so the file itself never crosses this
boundary — but any future endpoint that accepts a body must respect that ceiling.
