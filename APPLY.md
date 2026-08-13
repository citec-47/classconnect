# The upload error will now name itself

10 files. No migration.

```powershell
taskkill /F /IM node.exe
npm run build --workspace @classconnect/shared
npm run dev
```

Restart fully — `files.service.ts` is server-side.

---

## What your console told us

The console showed **no `[upload]` line at all** — only Fast Refresh noise. So the
upload request never ran. The failure is earlier, in
`POST /files/teacher-documents/sign`, and "Something went wrong on our side" is
`errors.generic` — the fallback for an **unhandled server exception**, not a
storage rejection.

That is why the raw-response display never appeared: it covers the upload step,
and we were never reaching it.

## Two likely causes, both now handled

**A teacher role without a teacher record.** `teacher_documents.teacher_id` is a
foreign key to `teachers`. A user holding the role but missing the row fails on
insert, and a foreign-key violation surfaces as a 500. Checked explicitly now,
with a message that says what to do.

**An unparseable expiry date.** `new Date('')` gives `Invalid Date`, which Prisma
rejects. An optional expiry that cannot be parsed is now treated as absent rather
than as a reason to refuse the whole upload — which is what an *optional* field
should mean.

## And if it is neither

The insert is wrapped, so any other database error is logged with the cause and
returned as a readable message instead of a 500:

```
[upload] could not record document for <user>: <the actual error>
```

That line will be in your API terminal on the next attempt, and it names the
cause exactly. After four rounds of inference, this is the change that stops the
guessing — the server now reports its own failure rather than swallowing it.

---

## What to do

1. Restart, retry the PDF.
2. If it works, that was the FK or the date.
3. If not, the API terminal has one `[upload]` line. Paste that line and I will
   fix precisely what it names.

Also worth trying a **JPG** of the same document: if the image succeeds and the
PDF does not, the cause is in the PDF path specifically, which narrows it
immediately.
