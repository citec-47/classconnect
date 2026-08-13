# Build plan — the teacher, student and support surfaces

This plan turns the feature brief into an order of work against *this* repository.
It exists because the brief describes about thirty-five feature areas across four
dashboards, and handing that to a coding agent in one prompt reliably produces
code that does not compile: the agent has no way to know which models already
exist, so it invents parallel ones, and the result has to be thrown away.

Each phase below is sized to be given to an agent as a single prompt, and each
one leaves the repository in a state that builds and runs.

---

## What already exists

This is the most important section, because most of the brief is not a
greenfield build. `packages/db/prisma/schema.prisma` already models a great deal
of what the brief asks for, and asking an agent to "add exams" when `Assessment`,
`Question`, `QuestionOption`, `Attempt` and `Answer` are all present produces a
second, conflicting exam system.

| Brief calls for | Already in the schema |
|---|---|
| Lessons and materials | `Material`, with `levelId` / `subjectId` scoping |
| Exams, MCQ and structural | `Assessment`, `Question`, `QuestionOption`, `Attempt`, `Answer`, `AttemptReview` |
| Exam camera / proctoring | `ExamDeviceCheck`, `ProctorEvent`, `ProctorFlag`, and `packages/shared/src/exam-proctoring.ts` |
| Live sessions | `Session`, `SessionParticipant`, `SessionType`, `SessionStatus` |
| Recorded live videos | `Recording`, `RecordingPlayback` |
| Who may speak in a live session | `MediaPublishRequest`, `MediaPublishRequestState` |
| Teacher earnings | `Earning`, `LedgerEntry`, `Payout`, and `apps/api/src/earnings/` |
| Messaging | `MessageThread`, `ThreadParticipant`, `Message`, `MessageAttachment` |
| Freezing an account, with auto-restore | `AccountFreeze`, `FreezeScope`, `FreezeKind`, `FreezeCategory` |
| Rate your teacher | `Review`, plus `ratingAvg` / `ratingCount` on `Teacher` |
| Fees and instalments | `PaymentSchedule`, `Instalment`, `InstalmentState` |
| Homework / exercises | `WorkAssignment`, `Submission`, `SubmissionFile`, `Grade` |
| Groups | `Cohort`, `CohortMember` |
| Customer service role | `support_agent` in `packages/shared/src/roles.ts`, `SupportAgentProfile`, `Ticket` |
| Admin sets the hourly rate | `PlatformConfig`, `packages/shared/src/config-keys.ts` |

So the gap is mostly **surface and orchestration**, not data modelling. Before
writing a migration for anything below, grep the schema for the concept first.

### What genuinely has no model yet

- **Timetable slots.** `AvailabilityRule` is when a teacher is *free*, not what
  they are *timetabled to teach*. A `TimetableSlot` is new.
- **Report cards.** `Grade` holds one mark. A termly report card with subject
  coefficients, a weighted average and a class position is new.
- **Group exercises with a locking deadline.** `WorkAssignment` is close but is
  per-learner and has no lock-at-deadline behaviour.

---

## Phase 0 — done

The teacher surface exists and is reachable.

- `packages/shared/src/teacher-classes.ts` — the four-band taxonomy
- `packages/shared/src/teacher-nav.ts` — navigation as data
- `apps/api/src/teachers/teacher-classes.service.ts` and
  `teacher-dashboard.controller.ts`
- `apps/web/src/app/[lang]/teacher/{layout,page,classes/page}.tsx`
- `apps/web/src/components/teacher/Sidebar.tsx`
- `teacher:classes:read:own` added to `roles.ts` and granted to `teacher`
- Strings in both catalogues

**One design decision worth keeping.** Private Classes is *not* a fifth school
type. A private learner sits in some ordinary level and is taught one to one, so
the band is derived from the teaching relationship — `Assignment` is private,
`Cohort` is a group class — rather than stored. Adding `private` to the
`SchoolType` enum would break every existing query that switches on it.

**Also fixed in passing.** `apps/web/src/components/DocumentUpload.tsx` used
`apiBase()` and `tokenStore` without importing them. See the note at the end.

### Reachable, eventually — the routing bug this phase's title was wrong about

Phase 0 claimed the teacher surface "exists and is reachable". It existed. It was
reachable from the sign-in page and from nowhere else:

- **`register/page.tsx` pushed `/${language}`** regardless of role, so a teacher
  who *signed up* was authenticated and then dropped on a public page headed
  "Create a parent account" — no acknowledgement of the account, no sign a teacher
  dashboard existed. `homeFor` had been written to fix exactly this failure on the
  sign-in page and was a local function in that file, so the second caller could
  not use it. It now lives in `apps/web/src/lib/home-for.ts` and both call it.
- **Neither `/sign-in` nor `/register` redirected an already-signed-in user.**
  Tokens are in `localStorage`, so returning the next morning and clicking Sign in
  is the ordinary path, and being asked for a password you are already past reads
  as having been signed out.
- **The public header had no route to your own surface** — logo and language
  switcher only. `DashboardLink` renders one when signed in and nothing when not.
- **The unapproved dashboard listed six locked tiles, typed by hand.** By the time
  the surface was finished there were twelve, so a teacher waiting for approval was
  shown half of what they were waiting for. Derived from `TEACHER_NAV` now.

**And the gate the sidebar could not enforce.** Hiding a link is not access
control, and it was not the whole job either: a teacher typing a teaching URL
reached the screen, which asked the API for something their permissions do not
cover and rendered the 403 as a generic failure. `TeacherGate` wraps all eleven
teaching screens — the component inside never renders while unapproved, so the
calls that would fail are never made, and the panel says which of the four
verification states they are actually in. The server-side check is unchanged and
remains the real control (FR-RBA-002).

Tested in `apps/web/src/components/teacher/TeacherSurface.spec.tsx`: where each
role lands, and that an unapproved teacher has exactly Overview and Verification
clickable while an approved one has all thirteen.

---

## Phase 1 — Timetable

Everything else in the brief hangs off this. Live sessions start from it,
earnings are counted against it, and the clash rule is defined on it.

1. **Migration.** `TimetableSlot`: `id`, `levelId`, `cohortId?`, `teacherId`,
   `subjectId`, `dayOfWeek` (1–5), `startTime`, `endTime`, `confirmedBy?`,
   `confirmedAt?`, `state` (`proposed` | `confirmed` | `rejected`). Index on
   `(teacherId, dayOfWeek)` and `(levelId, dayOfWeek)` — those are the two reads.
2. **Clash detection.** The brief calls this "an AI system"; it is an interval
   overlap check and should be written as one, in `packages/shared/` so the API
   and the UI agree. Pure function, unit-testable: given a teacher's confirmed
   slots and a proposed slot, return the conflicts. Do not reach for a model.
3. **API.** Teacher proposes hours; admin and support confirm. Confirmation is
   what makes a slot count, so put the permission on the confirm endpoint, not
   the propose one.
4. **UI.** Teacher timetable (their slots across the classes they teach); admin
   and support timetable builder, per level, Monday to Friday.

Students and teachers read their timetable from the slots for their level, so
the "only people in that class see it" rule is a `where`, not a filter in the UI.

---

## Phase 2 — Lessons — done

Smallest useful phase, and it proved the file pipeline end to end.

- `packages/shared/src/dto.ts` — `publishLessonSchema`
- `packages/shared/src/roles.ts` — `lesson:publish:own`, granted to `teacher` alone
- `apps/api/src/files/lessons.service.ts` and `lessons.controller.ts`
- `apps/api/src/files/file-policy.ts` — `kindForMime`
- `apps/web/src/app/[lang]/teacher/lessons/page.tsx`
- `apps/web/src/components/student/cards.tsx` — `MaterialRow` can now open a lesson
- `teacher-nav.ts`: `lessons` is `implemented` and gated on the new permission
- Strings in both catalogues

**No migration.** `Material` already carried an owner, a level, a subject, a
storage key and a scan status, so a lesson *is* a `Material` with
`visibilityScope: 'level'`. The one thing it does not keep is the original file
name — its `title` is what the teacher typed for the learner to read — so
`kindForMime` resolves the Cloudinary resource type from the MIME type for every
step after signing. The name has already done its work by then: agreeing with the
declared type is what catches a PDF renamed to `.png`, and that check runs once,
at step one.

**The reader needed no work at all.** `learner-work.service.ts` already served
materials scoped to the learner's own level and filtered to `scanStatus: 'clean'`,
which is the brief's "only students under that particular class receive the
lessons" as a `where`. Phase 2 added the teacher's half and one button, and the
class-wide filter was already correct.

**`pending` is not `clean`.** No malware scanner is contracted, so the honest
verdict for most uploads is `pending` — stored, and served to nobody (FR-FIL-001).
The confirm response says which of the two happened and the screen has a third,
warning-toned message for it. Promoting `pending` to `clean` would have the
teacher find out from a child that the lesson never arrived.

Reused `DocumentUpload.tsx`'s sign-then-upload flow rather than writing a third
one. The one deliberate difference is the client timeout: ten minutes, not two, a
100 MB lesson on a mobile connection being a genuinely long request.

---

## Phase 3 — Groups and exercises — done

1. A group **is** a `Cohort`. `TeacherGroupsService` creates one, sets its
   membership (replace, not append; leaving is `leftAt`, never a delete, because
   FR-HWK-005 keeps every submission), and sets exercises against it.
2. **Locking.** `WorkAssignment.locksAt` is new and is *not* `dueAt`: work handed
   in after `dueAt` is accepted and marked late (FR-HWK-004), and after `locksAt`
   nothing is accepted at all. The rule is `exerciseAcceptsSubmission` in
   `packages/shared/src/exercises.ts`, run by the API against its own clock; the
   countdown on the screen renders from the same function, so the badge and the
   refusal cannot disagree. Reopening needs a reason and writes
   `exercise.unlocked` to the audit log.
3. **Group scores are `GroupScore`, not `Grade`.** A `Grade` hangs off a
   `Submission`, so writing a group mark as one would mean inventing a submission
   for every learner who handed nothing in — turning "did not submit" into
   "submitted, empty" for the whole cohort.

Tests: `apps/api/src/teachers/exercises.spec.ts` — including the case that a
reopen predating the deadline it would have lifted does **not** unlock, which is
how "reopen, then set a later deadline" would otherwise never lock again.

---

## Phase 4 — Exams — done

The models existed; this is the marking and delivery logic, plus two columns
`Assessment` turned out to need: which class an exam is set for (`levelId`,
`cohortId`) and whether it is still a draft (`publishedAt`).

- MCQ marks automatically against `QuestionOption.isCorrect`, in `autoMark`,
  server-side. `mcq_multi` is all-or-nothing — partial credit is a defensible
  policy and a *different* one, and choosing it silently would make two exams
  marked by the same platform incomparable.
- **A paper with a structural question is always `deferred`**, whatever the
  teacher chose, because a mark that is missing half the paper is not a result.
  The form says so before the choice is made; the server overrides it anyway.
- Releasing results refuses while any structural answer is unmarked.
- The question vocabulary is `QuestionType`'s own — `single_choice`,
  `multiple_response`, `free_response`. A friendlier trio mapped onto them would
  be a translation table for three values, and a bug waiting for the fourth.
- Not built: the learner's one-question-at-a-time runner. It is a client concern
  over the existing `Attempt`/`Answer` models, and `autoMark` is exported for its
  submit path so the comparison against the key stays in one place.

---

## Phase 5 — Live — 5a done, 5b/5c blocked on a media server

**What is built (5a).** The control plane, and it is complete: going live from a
confirmed timetable slot or ad hoc, the register, raised hands, granting and
revoking the floor (`MediaPublishRequest`), inviting a learner who did not ask,
ending the lesson, and the `Session.timetableSlotId` link that FR-ERN-003 needs.
Every live screen in the brief — teacher, learner, admin — reads these rows.

**What is not, and this is the honest part.** There is no SFU, so there is no
audio or video. `roomId` is minted and handed over; joining the room and
publishing tracks are the media server's half. The consequence is stated in
`teacher-live.service.ts`, on the screen, and here: **`attendedMinutes` stays 0
until a media server reports it.** The 30-minute earnings floor and the
40-minute rating rule are wired and correct and will read zero until then.
Filling them from the wall clock would be inventing attendance, and it would be
invisible once it reached a payslip.

**Earnings (5c) is an accrual view, not an `Earning` row.** `Earning` is
Finance's: `calculatePeriod` distributes a revenue pool and asserts
`sum(shares) + unallocated == pool` before writing. There is no daily row to
read and manufacturing one would break that identity. So
`TeacherEarningsService.accrual` values *qualifying* teaching — inside a
confirmed slot, past the floor — at `TEACHER_HOURLY_RATE_XAF`, and the screen
calls it indicative, because it is.

---

## Phase 6 — Report cards — done

- `ReportCard`, `ReportCardLine`, and `SubjectTermMark` — the last because the
  brief's "after all the teachers have submitted" needs somewhere for a mark to
  sit before the generating click, and it is not the report card.
- The arithmetic is pure, in `packages/shared/src/report-cards.ts`.
- **Ties rank by competition ranking: 1, 2, 2, 4.** Decided explicitly, as this
  file asked. Dense ranking would tell a family four children finished in the top
  three; a Cameroonian report card is read as "how many pupils did better", and
  three did. A learner with no average is not ranked *and does not count towards
  the class size* — 40th of 40 for unsubmitted marks is a statement about the
  school printed as a statement about the child.
- Tests first, as instructed: `apps/api/src/teachers/report-cards.spec.ts`,
  including the lopsided-coefficient case (18×4 + 8×1)/5 = 16, which is the bug
  that is invisible whenever every coefficient happens to be 1.
- **Not a background job, and the plan was wrong about why.** The whole
  calculation is two queries and arithmetic in memory. What made it look like a
  job was assuming a query per child. It is one transaction, because a
  half-generated class has positions computed against a subset — wrong, and
  wrong invisibly.
- The teacher submits marks (`report:submit:own`); staff generate
  (`report:generate`). One teacher should not hold a permission whose output
  depends on every other teacher having finished.

---

## Phase 7 — Customer service surface

The `support_agent` role and its permissions already exist. This is a fourth
route group, `apps/web/src/app/[lang]/support/`, built the way `teacher/` was in
Phase 0: navigation as data, permissions on every endpoint, no new roles.

Screens: live chat, fee receipts, messaging, teacher approvals, payment status,
live status, all-current-live, students and teachers by band, monthly
registrations, class and subject assignment.

**One caution.** "All Current Live — the teacher will not see any additional
person" is silent observation of a class containing children. The repository
already has a safeguarding model (`SafeguardingReport`, `RedactionFlag`, a
designation check in `admin-nav.ts`). Route this through it: log every silent
join to `AuditLog`, and decide deliberately whether teachers are told this can
happen. That is a policy question, not a coding one, and it should be answered
before the feature ships rather than after.

---

## Phase 8 — Admin additions

Engagement and visitor location, profit graph, teacher payment performance
banding, admin go-live with invitation targeting, rates and freeze management.

Freezing is already modelled including auto-restore (`AccountFreeze` carries the
scope, the reason and the expiry), so this is largely surface over existing
behaviour — check `apps/api/src/admin/governance.service.ts` before writing any
of it.

---

## How to prompt an agent for a phase

Give it one phase. Include: the phase text above, the relevant slice of
`schema.prisma`, and one existing file to copy conventions from. Then require:

- No new Prisma model without first showing why an existing one does not fit.
- Every endpoint carries `@RequirePermissions`; the guard is default-deny, so an
  undecorated endpoint fails closed rather than opening a hole — but it also
  means the screen will 403 and look broken.
- Every user-visible string goes in **both** catalogues. `fr.ts` is structurally
  type-checked against `en.ts`, so a missing French key is a compile error.
- `npm run typecheck` and `npm test` pass before the phase is called done.

---

## Two things to fix in the existing code

Found while type-checking; neither was introduced by this work.

**1. `DocumentUpload.tsx` — fixed here.** It used `apiBase()` and `tokenStore`
without importing them. At runtime the sign step succeeded and the *upload* step
threw `ReferenceError: apiBase is not defined` before any request was made,
which the catch block reported as `errors.generic`.

That matches the symptom recorded in `APPLY.md` more closely than the
foreign-key theory it was chasing: it explains why the console showed no
`[upload]` line, why no raw response was ever displayed, and why the API
terminal stayed silent — the request never left the browser, so there was
nothing server-side to log. Worth re-testing the PDF upload before doing any
more work on `files.service.ts`.

**2. Nine remaining type errors — fixed in Phase 2.** They had been invisible:
`npm run typecheck` chains five `tsc` runs with `&&`, the API's run was failing,
and so the web project was never reached. All nine were in `apps/web`:

- `admin/messages/page.tsx` and `admin/payments/students-fees/page.tsx` passed a
  `subtitle` prop to `PageHeader`, which takes `description`.
- `students-fees/page.tsx` also passed `message` to a children-only `SuccessAlert`,
  and used a four-tone set of its own invention where `StateChip` has
  `neutral | good | warn | frozen`. Remapped: `not_registered` takes the one red on
  the surface, because a learner with no fee schedule at all is the row an operator
  has to act on.
- `student/AttachmentPicker.tsx` used `localId` on `PendingAttachmentDto`, which the
  type did not declare — five errors, one missing field. Declared: `attachmentId`
  changes when the upload is signed, so it cannot be what a tile is matched on.

`npm run typecheck` now passes all five projects.

### Tests that were already red, and still are

Twelve failures, none touched by Phase 1 or 2. They are listed here so the next
phase does not mistake them for its own:

| Where | What |
|---|---|
| `StudentSurface.spec.tsx` ×4, `student-levels.spec.ts` ×3 | Expect five learner tabs; the catalogue now has seven. The test is stale, not the code. |
| `domain-rules.spec.ts` | Expects `support_agent` not to hold `teacher:verification:decide`. `roles.ts` grants it deliberately and says why. |
| `domain-rules.spec.ts` | Nineteen keys whose French is identical to the English — `Actions`, `Classes`, `Total`, `min`. Most are correct as they stand and the test needs an allow-list. |
| `gsm7.spec.ts` ×2 | `teacherVerificationPending.body` uses characters outside GSM-7, so it costs double as an SMS. |
| `api-contract.spec.ts` | `/payments/offline` is called by `RecordPaymentDialog.tsx` and served by nothing. A real bug, in Phase 8's territory. |

The last two are worth fixing on their own merits; the first three are tests to
update rather than code to change.
