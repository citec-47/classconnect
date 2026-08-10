# Fees page: amounts, and a design that answers the real question

5 files. Unzip over the repository root.

```powershell
npm run build --workspace @classconnect/shared
npm run dev
```

No migration.

---

## Two bugs fixed

**The notice rendered as `notifications.fees.registered.body`.** `t()` splits keys
on dots, so it was looking for notifications → fees → registered → body while the
catalogue held a single quoted key `'fees.registered'`. That path could never
resolve. The keys are nested properly now.

**No amounts anywhere.** Withheld deliberately — a bill is the payer's business
and a child should not be handed one they cannot act on (FR-PAY-003). That stops
making sense the moment guardians sign in through the learner's account, because
the rule then guarantees the *payer* never sees what they owe. Amounts are shown.

The copy still names whose responsibility the money is, so a child reading their
own screen is not left feeling it is theirs to solve.

## The redesign

Built around the question a reader actually has — not "what is my status" but
**"how much is left, and when is it due?"**

- **The outstanding amount is the headline**, in large figures.
- **A progress bar** showing how far through the plan they are, with the same
  fact in words underneath, since the bar alone is not readable to everyone
  (UI-003).
- **Each part carries its own amount and date.** Settled parts get a tick and the
  amount struck through; the part that is due gets a brand border; an overdue one
  gets a red border.
- **Recent updates** below, with a coloured edge, newest first.

Money is `15 000 FCFA` throughout — whole francs, thousands separated (UI-009).

## The trade I made, stated plainly

The safer long-term shape is a **guardian login of its own**: the payer sees full
amounts, the child's view stays stage-only. `guardian_learners` already models
it, and the SRS assumes it.

Showing amounts on the learner's screen is the right call *given* guardians share
that login today — but it does mean a child on a frozen account sees a bill they
cannot act on. Worth revisiting before launch rather than leaving as an accident.
I can build the guardian surface whenever you want it.
