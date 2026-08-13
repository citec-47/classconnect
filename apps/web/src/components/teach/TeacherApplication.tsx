'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api, apiUpload, ApiError } from '@/lib/api';
import { Field } from '@/components/Field';
import { ErrorAlert, SuccessAlert } from '@/components/Alert';
import { LanguagesPicker } from '@/components/LanguagePicker';
import type { Language } from '@classconnect/shared';
import { DocumentUpload, type UploadedDocument } from '@/components/DocumentUpload';
import { IntroVideoRecorder } from '@/components/teach/IntroVideoRecorder';
import { IdentityUpload } from '@/components/teach/IdentityUpload';

interface Application {
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'more_info_required';
  submittedAt: string | null;
  rejectionReason: string | null;
  payoutWalletPreview: string | null;
  walletVerified: boolean;
  highestQualification: string | null;
  institution: string | null;
  qualificationYear: number | null;
  yearsExperience: number;
  subjects: {
    subject: { id: string; nameEn: string; nameFr: string };
    level: { id: string; nameEn: string; nameFr: string };
  }[];
  documents: {
    id: string;
    type: string;
    fileName: string;
    scanStatus: string;
    expiresOn: string | null;
  }[];
}

/**
 * The fields this page flags on the input itself.
 *
 * Kept beside the summary alert so the two cannot drift: a field named here is
 * left out of the banner, and a field the server rejects that is *not* here
 * still gets named — which is the case that stranded applicants when a required
 * `nationalId` had no form control at all.
 */
const INLINE_FIELDS = [
  'highestQualification',
  'institution',
  'qualificationYear',
  'yearsExperience',
  'payoutWallet',
] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ink-100 text-ink-600',
  submitted: 'bg-brand-50 text-brand-700',
  under_review: 'bg-brand-50 text-brand-700',
  approved: 'bg-success-50 text-success-600',
  rejected: 'bg-danger-50 text-danger-600',
  more_info_required: 'bg-warning-50 text-warning-600',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'teacher.statusDraft',
  submitted: 'teacher.statusSubmitted',
  under_review: 'teacher.statusUnderReview',
  approved: 'teacher.statusApproved',
  rejected: 'teacher.statusRejected',
  more_info_required: 'teacher.statusMoreInfo',
};

const STATUS_HINT: Record<string, string> = {
  draft: 'teacher.statusDraftHint',
  submitted: 'teacher.statusSubmittedHint',
  under_review: 'teacher.statusUnderReviewHint',
  approved: 'teacher.statusApprovedHint',
  more_info_required: 'teacher.statusMoreInfoHint',
};

/**
 * The teacher's own record.
 *
 * Read-only as far as credentials go: an Admin created this account and
 * recorded the verification, so there is no application form here. What a
 * teacher can still do is supply documents — FR-TVR-007 requires
 * re-verification before a credential expires, and FR-TVR-002 governs what may
 * be uploaded.
 */
/**
 * The teacher's verification application.
 *
 * Lives here rather than in a route because two surfaces show it: the teacher
 * dashboard's Verification screen, which is where an applicant is sent, and the
 * public `/teach` URL that predates it and still has to work.
 */
export function TeacherApplication() {
  const [uploadingIntro, setUploadingIntro] = useState(false);
  const [rerecording, setRerecording] = useState(false);
  const { language, t } = useI18n();

  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'mtn_momo' | 'orange_money'>('mtn_momo');
  const [teachingLanguages, setTeachingLanguages] = useState<Language[]>([language]);
  const [form, setForm] = useState({
    highestQualification: '',
    institution: '',
    qualificationYear: '',
    yearsExperience: '',
    payoutWallet: '',
  });

  /*
   * Nothing on this screen said "that worked".
   *
   * The only feedback a successful submission produced was the status badge
   * quietly changing, several screens up — so an applicant who had just waited
   * ten seconds for a button had no confirmation at all, and every reason to
   * press it again.
   */
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => {
    // Editing anything means this is a new attempt, not the one just confirmed.
    setSent(false);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const load = useCallback(async () => {
    try {
      setApplication(await api<Application>('/teachers/me/application', { language }));
    } catch (caught) {
      setError(caught as ApiError);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Seeded once, from the first load — not on every change to `application`.
   *
   * This used to re-run whenever the application object changed, and it sets
   * `payoutWallet` to the empty string because the stored number is encrypted
   * and never sent back. So a *successful* submit refreshed the application,
   * which re-ran this, which wiped the number the applicant had just typed —
   * and the "fill these in before you send" panel reappeared naming it. The
   * application had been sent. The screen said it had not, and asked for the
   * one field that cannot be restored from the server.
   *
   * Seeding once also protects anything else being typed: a background refresh
   * can no longer overwrite the form under the applicant's hands.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!application || seeded.current) return;
    seeded.current = true;
    setForm({
      highestQualification: application.highestQualification ?? '',
      institution: application.institution ?? '',
      qualificationYear: application.qualificationYear?.toString() ?? '',
      yearsExperience: application.yearsExperience?.toString() ?? '',
      // Cannot be pre-filled — FR-PRO-005 keeps it encrypted and unreadable.
      // The field's own hint says so when a number is already on file.
      payoutWallet: '',
    });
  }, [application]);

  /** FR-TVR-001: submit or correct the credentials an Admin will check. */
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       * The answer is used, not thrown away.
       *
       * This awaited the POST and then called `load()` to fetch the very thing
       * the POST had just returned — so submitting cost two full reads of the
       * application over a link where one already takes seconds, and the second
       * one could not tell the user anything the first had not.
       */
      const saved = await api<Application>('/teachers/me/application', {
        method: 'POST',
        body: {
          yearsExperience: Number(form.yearsExperience),
          highestQualification: form.highestQualification,
          institution: form.institution,
          qualificationYear: Number(form.qualificationYear),
          languages: teachingLanguages,
          // Registration already recorded these; the API keeps them when the
          // payload repeats what is stored.
          subjects: application!.subjects.map((pair) => ({
            subjectId: pair.subject.id,
            levelId: pair.level.id,
          })),
          payoutMethod,
          payoutWallet: form.payoutWallet,
        },
        language,
        /*
         * Longer than the 30s default, deliberately.
         *
         * This one request writes the application, its subjects and its
         * checklist and then reads the whole thing back, against a database in
         * another region — measured between 6s and 21s from here depending on
         * what else is competing for the machine. The default ceiling sat right
         * in the middle of that range, so a submission that was working was
         * reported to the applicant as "that is taking longer than expected",
         * and they pressed it again.
         *
         * `api()` names this case: "a caller that knows its own operation is
         * heavier can pass timeoutMs". A ceiling still has to exist — this one
         * is set past the worst measured run rather than removed.
         */
        timeoutMs: 120_000,
      });
      setApplication(saved);
      setSent(true);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const name = (item: { nameEn: string; nameFr: string }) =>
    language === 'fr' ? item.nameFr : item.nameEn;

  /**
   * The application is editable while it is still the applicant's to write.
   *
   * Once it has actually been sent it becomes the thing an Admin is reading, and
   * a form that changes underneath a reviewer is a decision recorded against
   * evidence that no longer exists. Approved and rejected are closed for the
   * same reason, more firmly: FR-TVR-010 keeps that record as the evidence for
   * the decision.
   *
   * `more_info_required` reopens it — FR-TVR-006 gives the applicant the right
   * to answer and resubmit.
   *
   * ## Why the status alone is not enough
   *
   * Registration creates a self-registered teacher already in `submitted`, with
   * `submittedAt` set (see `auth.service.ts`) — before they have filled in a
   * single credential. Locking on status would shut every new teacher out of
   * the very form they were sent to complete, and neither field can tell that
   * case apart.
   *
   * `highestQualification` can: registration never writes it and the
   * application form always does, because the API requires it. So it is the
   * honest marker for "this application has actually been made".
   */
  const everSubmitted = application !== null && application.highestQualification !== null;
  const awaitingDecision =
    application !== null && ['submitted', 'under_review'].includes(application.status);

  const editable =
    application !== null &&
    (application.status === 'draft' ||
      application.status === 'more_info_required' ||
      // Sent to the queue by registration, but never actually filled in.
      (awaitingDecision && !everSubmitted));

  /** Sent, and now somebody else's to act on. */
  const underReview = awaitingDecision && everSubmitted;

  /*
   * The introduction goes through the same three steps as any document: sign,
   * upload to storage, confirm and scan. Reusing that path rather than adding a
   * second one means the video is scanned like everything else — which for a
   * file a stranger uploads is the point (FR-FIL-001).
   */
  const uploadIntro = useCallback(
    async (file: File) => {
      setUploadingIntro(true);
      /*
       * Clear whatever the last action complained about.
       *
       * Without this the banner from an earlier failed *submit* — listing
       * fields that have nothing to do with the video — survives into the
       * upload and re-renders as the recording is accepted. It reads exactly
       * as though "Use this recording" caused it, so the applicant retakes a
       * perfectly good video trying to satisfy an error about their payout
       * details.
       */
      setError(null);
      try {
        const signed = await api<{
          documentId: string;
          upload: { url: string; fields: Record<string, string> };
        }>('/files/teacher-documents/sign', {
          method: 'POST',
          body: {
            type: 'intro_video',
            fileName: file.name,
            mimeType: file.type || 'video/webm',
            sizeBytes: file.size,
          },
          language,
        });

        // Step 2: the bytes go through our API, not straight to storage. See the
        // service for why — a direct cross-origin POST fails silently here and
        // leaves the row stuck at `awaiting_upload`.
        const put = await apiUpload(
          `/files/teacher-documents/${signed.documentId}/upload`,
          file,
        );
        if (!put.ok) {
          const raw = await put.text().catch(() => '');
          // eslint-disable-next-line no-console
          console.error('[upload] refused', put.status, raw);
          let key = 'errors.file.upload_rejected';
          try {
            const parsed = JSON.parse(raw) as { messageKey?: string };
            if (parsed?.messageKey) key = parsed.messageKey;
          } catch {
            /* not JSON — status and body already logged */
          }
          throw new ApiError(put.status, key);
        }

        const confirmed = await api<UploadedDocument>(
          `/files/teacher-documents/${signed.documentId}/confirm`,
          { method: 'POST', language },
        );

        setApplication((current) =>
          current
            ? {
                ...current,
                documents: [
                  ...current.documents,
                  {
                    id: confirmed.id,
                    type: confirmed.type,
                    fileName: confirmed.fileName,
                    scanStatus: confirmed.scanStatus,
                    expiresOn: null,
                  },
                ],
              }
            : current,
        );
        setRerecording(false);
      } catch (caught) {
        setError(caught as ApiError);
      } finally {
        setUploadingIntro(false);
      }
    },
    [language],
  );

  if (!application) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorAlert error={error} />
        {!error && <p className="text-ink-600">{t('common.loading')}</p>}
      </div>
    );
  }

  /*
   * A row at `awaiting_upload` is a failed attempt, not a document.
   *
   * The row is created when the upload is signed, so an upload that never
   * landed leaves one behind — and three of those in a list, each saying "we
   * are checking this file", is a lie to the applicant and noise for the
   * reviewer. They are filtered out here and the checklist ignores them.
   */
  const landedDocuments = application.documents.filter(
    (document) => document.scanStatus !== 'awaiting_upload',
  );
  const documentTypes = new Set(landedDocuments.map((document) => document.type));
  const hasIntroVideo = documentTypes.has('intro_video');
  const hasIdDocument = documentTypes.has('national_id') || documentTypes.has('passport');
  const identityDocument =
    landedDocuments.find(
      (document) => document.type === 'national_id' || document.type === 'passport',
    ) ?? null;
  const introVideo =
    !rerecording
      ? (landedDocuments.find((document) => document.type === 'intro_video') ?? null)
      : null;
  const hasQualificationDocument =
    documentTypes.has('degree_certificate') ||
    documentTypes.has('diploma') ||
    documentTypes.has('teaching_authorisation');

  /*
   * What actually stops the form being sent, named before it is clicked.
   *
   * This is exactly the set the API requires — and nothing else. Working it out
   * here rather than letting the server say no means the applicant is told
   * everything that is outstanding at once, in the language of the labels on
   * screen, instead of discovering it one native browser bubble at a time and
   * scrolling back up to find which box it meant.
   */
  const outstanding: string[] = [
    !form.highestQualification.trim() && 'teacher.qualification',
    !form.institution.trim() && 'teacher.institution',
    !form.qualificationYear.trim() && 'teacher.year',
    !form.yearsExperience.trim() && 'teacher.experience',
    teachingLanguages.length === 0 && 'teacher.teachingLanguages',
    !form.payoutWallet.trim() && 'admin.payoutWallet',
  ].filter((key): key is string => typeof key === 'string');

  /*
   * Deliberately separate from `outstanding`.
   *
   * The API does not require a single document to accept an application, and an
   * applicant who believes it does sits on a finished form for days waiting to
   * find a scanner. They are what an Admin needs to *approve*, not what the
   * form needs to *send* — so they are listed as the next thing to do rather
   * than as a barrier.
   */
  const recommended: string[] = [
    !hasIdDocument && 'teach.checklist.idDocument',
    !hasQualificationDocument && 'teach.checklist.certificate',
    !hasIntroVideo && 'teach.step.video',
  ].filter((key): key is string => typeof key === 'string');

  return (
    /*
     * `max-w-md` — 448px — was applied at every width, so a desktop showed a
     * phone-shaped column with a form crushed into it. An application is a
     * document someone works through, not a signup, and it deserves the room.
     *
     * One column on a phone, two from `lg`: the status and what has been
     * gathered on the right where it can be glanced at, the work itself on the
     * left. The sticky aside means an applicant filling in the form can still
     * see what is outstanding.
     */
    <div className="mx-auto max-w-5xl px-4">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          {t('teacher.myAccount')}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-ink-600">
          {t('teacher.applicationIntro')}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      {/*
       * One form around the whole column, submitted once, at the end.
       *
       * The details, the video and the documents were three separate blocks with
       * the submit button buried in the middle of the first — so an applicant
       * could send an application before reaching the parts that decide it.
       *
       * The element is always a form, even when the application is locked: a
       * conditional wrapper would mean two different trees for React to
       * reconcile, and there is nothing to submit when the inputs are absent.
       */}
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >

      <div className="cc-card">
        <span className={`cc-badge ${STATUS_STYLES[application.status]}`}>
          {t(STATUS_LABEL[application.status] ?? 'teacher.statusDraft')}
        </span>
        <p className="mt-2 text-sm text-ink-600">
          {t(STATUS_HINT[application.status] ?? 'teacher.statusDraftHint')}
        </p>

        {/*
         * FR-TVR-006: where more is needed, the reason is shown — and labelled.
         *
         * Unlabelled, the reviewer's sentence appeared as a loose line of
         * orange text under the status and read like part of it. It is the most
         * important thing on the page for anyone who has been turned down or
         * asked for more, and it is the only text here written by a person.
         */}
        {application.rejectionReason && (
          <div
            className={`mt-3 rounded-lg border p-3 ${
              application.status === 'rejected'
                ? 'border-danger-600 bg-danger-50'
                : 'border-warning-600 bg-warning-50'
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                application.status === 'rejected' ? 'text-danger-600' : 'text-warning-600'
              }`}
            >
              {t(
                application.status === 'rejected'
                  ? 'teach.decision.rejectedTitle'
                  : 'teach.decision.moreInfoTitle',
              )}
            </p>
            <p className="mt-1 text-sm text-ink-900">{application.rejectionReason}</p>
          </div>
        )}

        {/*
         * Says plainly that the form is closed, and why.
         *
         * Without this the page simply renders the details as flat text with no
         * button anywhere, which reads as broken rather than as finished.
         */}
        {underReview && (
          <div className="mt-3 rounded-lg border border-brand-600 bg-brand-50 p-3">
            <p className="text-sm font-semibold text-brand-700">
              {t('teach.decision.lockedTitle')}
            </p>
            <p className="mt-1 text-sm text-ink-900">{t('teach.decision.lockedBody')}</p>
          </div>
        )}
      </div>


      {/*
        FR-TVR-001: the credentials an Admin will check.

        Editable while the application is open. Registration captured who they
        are and what they teach; this is what verification actually examines, so
        a teacher can complete or correct it without queueing for staff time.
      */}
      {/*
       * One form, submitted once, at the end.
       *
       * The details, the video and the documents were three separate blocks
       * with the submit button buried in the middle of the first — so an
       * applicant could send an application before reaching the parts that
       * decide it. Wrapping the three steps in a single form puts the button
       * after everything it commits.
       */}
      {editable ? (
        <div className="cc-card">
          <h2 className="font-display text-lg font-semibold text-ink-900">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-sm text-brand-700">
              1
            </span>
            {t('teach.step.about')}
          </h2>
          <p className="cc-hint mb-3">{t('teach.step.aboutHelp')}</p>

          <Field
            label={t('teacher.qualification')}
            required
            value={form.highestQualification}
            onChange={set('highestQualification')}
            errorKey={error?.fieldError('highestQualification')}
          />
          <Field
            label={t('teacher.institution')}
            required
            value={form.institution}
            onChange={set('institution')}
            errorKey={error?.fieldError('institution')}
          />
          <Field
            label={t('teacher.year')}
            type="number"
            required
            value={form.qualificationYear}
            onChange={set('qualificationYear')}
            errorKey={error?.fieldError('qualificationYear')}
          />
          <Field
            label={t('teacher.experience')}
            type="number"
            required
            value={form.yearsExperience}
            onChange={set('yearsExperience')}
            errorKey={error?.fieldError('yearsExperience')}
          />
          <LanguagesPicker
            value={teachingLanguages}
            onChange={setTeachingLanguages}
            label={t('teacher.teachingLanguages')}
            hint={t('teacher.teachingLanguagesHint')}
          />

          {/*
           * The identity *number* field is gone.
           *
           * It asked an applicant to type an ID number into a form while also
           * asking them to upload the document it is printed on — the same fact
           * twice, one of them unverifiable. The upload is the evidence; a typed
           * number adds a second copy of personal data to protect and nothing to
           * check it against.
           */}
          <Field
            label={t('admin.payoutWallet')}
            /*
             * Says why the box is empty when a number is already on file.
             *
             * The stored wallet is encrypted and never sent back (FR-PRO-005),
             * so this field cannot be pre-filled — which, on a resubmission,
             * looks exactly like the platform lost it. Showing the masked
             * number we hold turns a blank box into a confirmation.
             */
            hint={
              application.payoutWalletPreview
                ? t('teacher.payoutOnFile', { number: application.payoutWalletPreview })
                : t('teacher.payoutHint')
            }
            type="tel"
            required
            value={form.payoutWallet}
            onChange={set('payoutWallet')}
            errorKey={error?.fieldError('payoutWallet')}
          />

        </div>
      ) : (
      <div className="mt-4 cc-card">
        <h2 className="font-medium text-ink-900">{t('teacher.qualification')}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-600">{t('teacher.qualification')}</dt>
          <dd className="text-ink-900">{application.highestQualification ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.institution')}</dt>
          <dd className="text-ink-900">{application.institution ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.year')}</dt>
          <dd className="text-ink-900">{application.qualificationYear ?? t('common.notRecorded')}</dd>
          <dt className="text-ink-600">{t('teacher.experience')}</dt>
          <dd className="text-ink-900">{application.yearsExperience}</dd>
          {/* FR-PRO-005: a masked confirmation, never the value itself. */}
          {application.payoutWalletPreview && (
            <>
              <dt className="text-ink-600">{t('teacher.payoutDetails')}</dt>
              <dd className="font-mono text-ink-900">{application.payoutWalletPreview}</dd>
            </>
          )}
        </dl>

        {application.subjects.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-medium text-ink-900">{t('teacher.subjectsTaught')}</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {application.subjects.map((pair, index) => (
                <li key={index} className="cc-badge bg-ink-100 text-ink-600">
                  {name(pair.subject)} · {name(pair.level)}
                </li>
              ))}
            </ul>
          </>
        )}

      </div>
      )}

      <ErrorAlert error={error} handledFields={INLINE_FIELDS} />

      {/*
       * The introduction, before the paperwork.
       *
       * It is the part an applicant is most likely to put off, and the part a
       * reviewer relies on most — a certificate says what somebody studied and
       * nothing about whether they can hold a class. Putting it above the
       * document list makes it look like a step rather than an optional extra.
       */}
      {editable && (
        <div className="cc-card">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-sm text-brand-700">
              2
            </span>
            {t('teach.step.video')}
          </h2>
          {/*
           * Once uploaded, the recorder is replaced by the recording.
           *
           * An applicant who cannot watch back what they sent has to trust that
           * it worked — and this is the piece a reviewer weighs most, so the
           * anxiety is reasonable. Re-recording replaces it rather than adding a
           * second video for somebody to choose between.
           */}
          {introVideo ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-600">{t('teach.videoUploaded')}</p>
              <IntroVideoPlayer documentId={introVideo.id} />
              <button
                type="button"
                onClick={() => setRerecording(true)}
                className="min-h-touch text-sm text-brand-600 underline"
              >
                {t('teach.replaceVideo')}
              </button>
            </div>
          ) : (
            <>
              <IntroVideoRecorder
                onRecorded={(file) => void uploadIntro(file)}
                disabled={uploadingIntro}
              />
              {uploadingIntro && (
                <p className="mt-2 text-xs text-ink-600">{t('teach.intro.uploading')}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* FR-TVR-002 / FR-TVR-007: supporting documents and re-verification. */}
      <div className="cc-card">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-sm text-brand-700">
            3
          </span>
          {t('teach.step.documents')}
        </h2>
        {/*
         * Identity first, and on its own.
         *
         * It was one option in a dropdown beside degree certificates, so an
         * applicant could submit without it and nothing stopped four being
         * attached. Exactly one slot, replaced rather than added to.
         */}
        {/*
         * The uploaders close with the rest of the form.
         *
         * A document arriving after the reviewer has started reading changes
         * the evidence under the decision — and the list below stays, so the
         * applicant can still see exactly what was sent.
         */}
        {editable && (
        <>
        <IdentityUpload
          existing={identityDocument}
          onUploaded={(document) =>
            setApplication((current) =>
              current
                ? {
                    ...current,
                    documents: [
                      ...current.documents,
                      {
                        id: document.id,
                        type: document.type,
                        fileName: document.fileName,
                        scanStatus: document.scanStatus,
                        expiresOn: null,
                      },
                    ],
                  }
                : current,
            )
          }
          onReplaced={(removedId) =>
            setApplication((current) =>
              current
                ? {
                    ...current,
                    documents: current.documents.filter((d) => d.id !== removedId),
                  }
                : current,
            )
          }
        />

        <div className="mt-4">
          <p className="text-sm font-medium text-ink-900">{t('teach.documentKind')}</p>
          <p className="mt-0.5 text-xs text-ink-600">{t('teach.documentKindHint')}</p>
        </div>

        <DocumentUpload
          language={language}
          onUploaded={(document: UploadedDocument) =>
            setApplication((current) =>
              current
                ? {
                    ...current,
                    documents: [
                      ...current.documents,
                      {
                        id: document.id,
                        type: document.type,
                        fileName: document.fileName,
                        scanStatus: document.scanStatus,
                        expiresOn: null,
                      },
                    ],
                  }
                : current,
            )
          }
        />
        </>
        )}

        {landedDocuments.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {landedDocuments.map((document) => (
              <li
                key={document.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-300 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{document.fileName}</p>
                  <p className="text-xs text-ink-600">
                    {t(`teacher.documentType.${document.type}`)}
                  </p>
                  {/* FR-FIL-001: say plainly why a file cannot be opened yet. */}
                  {document.scanStatus !== 'clean' && (
                    <p className="mt-1 text-xs text-warning-600">
                      {document.scanStatus === 'quarantined'
                        ? t('teacher.documentQuarantined')
                        : t('teacher.documentPendingScan')}
                    </p>
                  )}
                </div>
                <span
                  className={`cc-badge ${
                    document.scanStatus === 'clean'
                      ? 'bg-success-50 text-success-600'
                      : document.scanStatus === 'quarantined'
                        ? 'bg-danger-50 text-danger-600'
                        : 'bg-warning-50 text-warning-600'
                  }`}
                >
                  {document.scanStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
       * The commit, after everything it commits.
       *
       * Full width and last, so it reads as the end of the task rather than a
       * control belonging to whichever section happens to sit above it.
       */}
      {editable && (
        <div className="cc-card">
          {/* Said where the button is, because that is where they are looking. */}
          {sent && <SuccessAlert>{t('teach.needed.sent')}</SuccessAlert>}

          {/*
           * The state of the form, stated before the button rather than after
           * it. Everything here is known without asking the server, so there is
           * no reason to make the applicant click to find out.
           */}
          {outstanding.length > 0 ? (
            <div className="mb-3 rounded-lg border border-warning-600 bg-warning-50 p-3">
              <p className="text-sm font-medium text-warning-600">
                {t('teach.needed.title')}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-900">
                {outstanding.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-success-600 bg-success-50 p-3">
              <p className="text-sm font-medium text-success-600">
                {t('teach.needed.ready')}
              </p>
              {/*
               * Said only once the form can actually be sent, because before
               * that it is not the applicant's next move and would just be one
               * more thing to read.
               */}
              {recommended.length > 0 && (
                <p className="mt-1 text-sm text-ink-900">
                  {t('teach.needed.stillToAdd', {
                    items: recommended.map((key) => t(key)).join(', '),
                  })}
                </p>
              )}
            </div>
          )}

          <button type="submit" className="cc-btn-primary w-full" disabled={busy}>
            {busy ? t('common.sending') : t('teacher.submitApplication')}
          </button>
          <p className="mt-2 text-center text-xs text-ink-600">
            {t('teach.checklist.help')}
          </p>
        </div>
      )}

      </form>

      {/*
       * What is still outstanding, where it stays visible.
       *
       * An applicant who cannot see what is missing submits an incomplete
       * application and waits days to be told — which costs them and the
       * reviewer far more than a checklist costs us.
       */}
      <aside className="space-y-3 lg:sticky lg:top-6">
        <div className="cc-card">
          <h2 className="font-display text-base font-semibold text-ink-900">
            {t('teach.checklist.title')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <ChecklistItem done={Boolean(application.highestQualification)}>
              {t('teach.step.about')}
            </ChecklistItem>
            <ChecklistItem done={hasIntroVideo}>{t('teach.step.video')}</ChecklistItem>
            <ChecklistItem done={hasIdDocument}>
              {t('teach.checklist.idDocument')}
              {/*
               * Says *where*, not just *what*.
               *
               * The ID has its own upload slot, separate from the general
               * document picker — so an applicant who uploads their ID through
               * the general one, choosing a type like "Degree certificate",
               * gets a file safely stored and a checklist item that stays
               * stubbornly unticked with nothing on screen explaining why.
               */}
              {!hasIdDocument && (
                <span className="block text-xs text-ink-600">
                  {t('teach.checklist.idDocumentWhere')}
                </span>
              )}
            </ChecklistItem>
            <ChecklistItem done={hasQualificationDocument}>
              {t('teach.checklist.certificate')}
            </ChecklistItem>
          </ul>
          <p className="mt-3 text-xs text-ink-600">{t('teach.checklist.help')}</p>
        </div>
      </aside>
      </div>
    </div>
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs',
          done ? 'bg-success-600 text-white' : 'border border-ink-300 text-ink-600',
        ].join(' ')}
      >
        {done ? '✓' : ''}
      </span>
      {/* Never colour alone: the state is in the text for a screen reader. */}
      <span className={done ? 'text-ink-600 line-through' : 'text-ink-900'}>{children}</span>
      <span className="sr-only">{done ? ' — done' : ' — still needed'}</span>
    </li>
  );
}

/**
 * Plays back an uploaded introduction.
 *
 * The URL is fetched when the player is shown rather than sent with the
 * application: FR-FIL-003 forbids permanent URLs, and minting one for a video
 * nobody opened would hand out a live link for no reason.
 */
function IntroVideoPlayer({ documentId }: { documentId: string }) {
  const { t, language } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api<{ url: string }>(
          `/files/teacher-documents/${documentId}/download-url`,
          { language },
        );
        if (!cancelled) setUrl(result.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, language]);

  if (failed) return <p className="text-xs text-ink-600">{t('teacher.documentPendingScan')}</p>;
  if (!url) return <div className="h-48 w-full animate-pulse rounded-lg bg-ink-100" />;

  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      className="h-48 w-full rounded-lg bg-black"
      aria-label={t('teach.watchYourVideo')}
    />
  );
}
