# Admin can edit the payment plan

10 files. Unzip over the repository root.

```powershell
npm run build --workspace @classconnect/shared
npm run dev
```

No migration.

---

## Edit plan

New **Edit plan** action on every registered row of Students — fees. Change what
each part costs and when it falls due; the student's Fees page shows the new
figures and dates immediately, and both the learner and the payer are notified.

Three rules the server enforces, surfaced in the dialog **before** the save
rather than after a rejection:

1. **The parts must add up to the total** (§5.1). A running sum is shown live and
   Save stays disabled until it matches, so the constraint is visible while it is
   being broken.
2. **A settled part cannot be re-priced.** Money has already moved against it, and
   changing the figure would make the ledger disagree with the schedule. Those
   rows are locked and say why. Reverse it with Set status first if that is
   genuinely the intent.
3. **Whole francs only** (CON-02). XAF has no subunit.

A reason is required, and the change is audited with the before and after.

## Bug fixed: `{learner}` showing literally

`payloadJson` stores the **rendered** subject and body — the notification service
interpolates before it stores, because the same text goes out by SMS and email
where there is no client to render it.

I had been passing that payload as interpolation *parameters*, so `{learner}`
had nothing to substitute. The page now shows the stored text verbatim, which is
also a more honest record: it is exactly what the family was sent.

## The three admin actions, and when to use which

| Action | Use when |
|---|---|
| **Record payment** | Money was actually received. Cash account, numbered invoice, instalments settled in sequence. |
| **Edit plan** | The amounts or dates themselves are wrong or renegotiated. |
| **Set status** | The status needs correcting without a payment — a waiver, a mistaken entry, fees recorded elsewhere. Posts a balancing ledger entry. |

All three require `finance:record_payment`, all three demand a reason, and all
three are audited.
