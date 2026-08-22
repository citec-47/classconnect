/**
 * Wire contracts, shared by the API and the web client so a change to a payload
 * cannot silently diverge between the two.
 *
 * FR-RBA-002: these schemas are validated server-side. Client-side validation is
 * a convenience for the user, never the access or integrity control.
 */

import { z } from 'zod';
import { normalisePhone } from './phone';
import { ROLES } from './roles';

export const languageSchema = z.enum(['en', 'fr']);

/** FR-AUT-002: normalised to E.164 at the boundary, so nothing downstream re-parses. */
export const phoneSchema = z
  .string()
  .min(6)
  .max(24)
  .transform((value, ctx) => {
    const parsed = normalisePhone(value);
    if (!parsed) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'errors.phone.invalid' });
      return z.NEVER;
    }
    if (!parsed.isMobile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'errors.phone.not_mobile' });
      return z.NEVER;
    }
    return parsed.e164;
  });

export const emailSchema = z.string().email().max(320).toLowerCase().trim();

/**
 * NFR-SEC-001 governs storage; this governs acceptance. Length beats composition
 * rules for real-world strength, and NFR-USA-004 wants a message a user can act on.
 */
export const passwordSchema = z
  .string()
  .min(10, 'errors.password.too_short')
  .max(200, 'errors.password.too_long');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'errors.otp.format');

/**
 * Primary school, or secondary school.
 *
 * Declared here rather than beside the admin schemas because teacher
 * registration needs it first, and a `const` referenced before its declaration
 * throws when the module loads.
 */
export const schoolTypeSchema = z.enum(['primary', 'secondary', 'sixth_form']);
export type SchoolType = z.infer<typeof schoolTypeSchema>;

/**
 * The three bands, in the order they are taught and displayed.
 *
 * Exported as data so the filters, the pickers and the grouping on the admin
 * screens all order them the same way, and so adding a fourth band later is one
 * edit rather than a search for every hard-coded list.
 */
export const SCHOOL_TYPES: readonly SchoolType[] = ['primary', 'secondary', 'sixth_form'];

/** Message key for a band label, resolved against the EN/FR catalogues. */
export function schoolTypeLabelKey(schoolType: SchoolType): string {
  return `schoolType.${schoolType === 'sixth_form' ? 'sixthForm' : schoolType}`;
}

// ---------------------------------------------------------------------------
// Registration and authentication — FR-AUT-001..008
// ---------------------------------------------------------------------------

/**
 * Who may sign themselves up.
 *
 * FR-AUT-001: Parent, Adult Learner or Teacher. `student` is absent by design —
 * a Student account for a minor is created by an Admin, never by the child.
 *
 * A Teacher registering here creates an account, not an entitlement. FR-TVR-003
 * still holds: they land in `submitted`, and only an Admin working the
 * verification checklist can make them listable, assignable or payable.
 */
export const registerRoleSchema = z.enum(['parent', 'adult_learner', 'teacher']);

export const registerSchema = z
  .object({
    role: registerRoleSchema,
    fullName: z.string().min(2).max(200).trim(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    preferredLanguage: languageSchema.default('en'),
    /** NFR-PRV-002: acceptance of the privacy notice and terms is recorded. */
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'errors.terms.required' }),
    }),
    /** Adult Learner registers themselves; date of birth establishes 18+. */
    dob: z.string().date().optional(),

    /**
     * FR-TVR-001: a teacher states what they teach when they apply.
     *
     * `schoolType` travels with the subjects so the server can check the two
     * agree. Subjects are level-scoped (FR-PRO-002), so a pair naming a level
     * outside the chosen school is a form that has drifted from the catalogue,
     * and trusting the level would enrol a primary teacher on A-Level papers.
     */
    schoolType: schoolTypeSchema.optional(),
    subjects: z
      .array(z.object({ subjectId: z.string().uuid(), levelId: z.string().uuid() }))
      .max(60)
      .optional(),

    /**
     * FR-TVR-001: the languages a teacher can teach in.
     *
     * Distinct from `preferredLanguage`, which is the language they read the
     * site in. A teacher browsing in English may well teach in French, and
     * FR-PRO-006 lets a family filter on this — so it is asked for rather than
     * copied from the interface.
     */
    teachingLanguages: z.array(languageSchema).max(2).optional(),
  })
  .refine((data) => data.phone !== undefined || data.email !== undefined, {
    message: 'errors.identifier.required',
    path: ['phone'],
  })
  .refine((data) => data.phone !== undefined || data.password !== undefined, {
    /*
     * Email-only registration must set a password, because there is no OTP
     * path to fall back on. Registering with a phone may set one too, and
     * should: without it the account can only ever be reached by asking for a
     * code, which costs an SMS every time and fails when the network does.
     */
    message: 'errors.password.required_for_email',
    path: ['password'],
  })
  .refine((data) => data.role !== 'adult_learner' || data.dob !== undefined, {
    message: 'errors.dob.required',
    path: ['dob'],
  })
  .refine((data) => data.role !== 'teacher' || data.schoolType !== undefined, {
    message: 'errors.teacher.school_required',
    path: ['schoolType'],
  })
  .refine((data) => data.role !== 'teacher' || (data.subjects?.length ?? 0) > 0, {
    message: 'errors.teacher.subjects_required',
    path: ['subjects'],
  })
  .refine((data) => data.role !== 'teacher' || (data.teachingLanguages?.length ?? 0) > 0, {
    message: 'errors.language.required',
    path: ['teachingLanguages'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['registration', 'login', 'password_reset', 'phone_change']),
  /** FR-AUT-005: WhatsApp or voice fallback where SMS delivery fails. */
  channel: z.enum(['sms', 'whatsapp', 'voice']).default('sms'),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  purpose: z.enum(['registration', 'login', 'password_reset', 'phone_change']),
  deviceLabel: z.string().max(200).optional(),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * FR-AUT-003: signing in with a password.
 *
 * Either identifier works. AS-07 makes the mobile number the universal one, and
 * most accounts here are identified by phone — an Admin creating a teacher or a
 * student sets a phone and a password, and demanding an email at sign-in would
 * make that password unusable.
 */
export const passwordLoginSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(1),
    deviceLabel: z.string().max(200).optional(),
    /** FR-AUT-009: required when the account holds a staff role. */
    mfaCode: z.string().regex(/^\d{6}$/).optional(),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    message: 'errors.identifier.required',
    path: ['phone'],
  });
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20) });

export const passwordResetRequestSchema = z
  .object({ email: emailSchema.optional(), phone: phoneSchema.optional() })
  .refine((d) => d.email !== undefined || d.phone !== undefined, {
    message: 'errors.identifier.required',
  });

/**
 * Changing a password you already know.
 *
 * Separate from the reset flow, which proves identity with a one-time code
 * because the person is locked out. Here they are signed in, so the proof is
 * the password being replaced — otherwise a handset left open on a shared desk
 * is a way to take the account over, which on §6.2's shared phones is the
 * ordinary case rather than the paranoid one.
 */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).optional(),
  phone: phoneSchema.optional(),
  code: otpCodeSchema.optional(),
  newPassword: passwordSchema,
});

/**
 * NFR-LOC-003: an explicit language override, persisted to the profile and
 * applied to every channel.
 *
 * The switcher already writes a cookie, which is enough for what the user can
 * see. This is for everything they cannot: reminders, receipts and safeguarding
 * notices are composed server-side from `preferredLanguage`, long after the
 * browser that made the choice has gone.
 */
export const updatePreferredLanguageSchema = z.object({
  preferredLanguage: languageSchema,
});
export type UpdatePreferredLanguageInput = z.infer<typeof updatePreferredLanguageSchema>;

// ---------------------------------------------------------------------------
// Family — FR-FAM-001..006
// ---------------------------------------------------------------------------

export const createLearnerSchema = z.object({
  fullName: z.string().min(2).max(200).trim(),
  /** FR-FAM-006: minor status is derived from this, never supplied by the client. */
  dob: z.string().date(),
  levelId: z.string().uuid().optional(),
  subjectIds: z.array(z.string().uuid()).max(20).default([]),
  preferredLanguage: languageSchema.default('en'),
  preferredStudyDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  preferredStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  preferredEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  targetExamSession: z.string().max(50).optional(),
});
export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;

export const updateLearnerSchema = createLearnerSchema.partial();

/** FR-FAM-003: a Parent may grant, and revoke, a Student's own sign-in. */
export const grantLearnerCredentialsSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema,
});

/** FR-FAM-004: a second Guardian may hold full or view-only rights. */
export const inviteGuardianSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  accessLevel: z.enum(['full', 'view_only']).default('view_only'),
});

// ---------------------------------------------------------------------------
// Teacher onboarding — FR-TVR-001..006
// ---------------------------------------------------------------------------

export const teacherApplicationSchema = z.object({
  bio: z.string().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(70),
  highestQualification: z.string().min(2).max(200),
  institution: z.string().min(2).max(200),
  qualificationYear: z.number().int().min(1950).max(2100),
  /**
   * FR-PRO-005 / NFR-SEC-003: encrypted at rest, never returned to learners.
   *
   * Optional, because the applicant form deliberately stopped asking for it —
   * the uploaded identity document is the evidence, and a typed number is a
   * second copy of personal data with nothing to check it against.
   *
   * Required here while the input was gone, it failed `min(4)` on the empty
   * string every single time, so no teacher application could ever be
   * submitted. Nothing highlighted either, because there was no field on the
   * page to highlight. The column is nullable, so optional is what the storage
   * has always said.
   */
  nationalId: z.string().min(4).max(60).optional(),
  address: z.string().max(300).optional(),
  languages: z.array(languageSchema).min(1),
  subjects: z
    .array(z.object({ subjectId: z.string().uuid(), levelId: z.string().uuid() }))
    .min(1, 'errors.teacher.subjects_required')
    .max(60),
  payoutMethod: z.enum(['mtn_momo', 'orange_money']),
  /**
   * One digit and above.
   *
   * Deliberately permissive: a real MTN or Orange wallet in Cameroon is nine
   * digits, but the length is not what makes it correct — FR-ERN-010 keeps the
   * wallet `walletVerified: false` until Finance confirms it, and that check is
   * what a payout actually depends on. Refusing a short number here only
   * blocked applicants part-way through a form, which a length rule was never
   * going to catch anyway.
   */
  payoutWallet: z.string().min(1).max(30),
});
export type TeacherApplicationInput = z.infer<typeof teacherApplicationSchema>;

/**
 * FR-TVR-005: approval requires an Admin to affirmatively record that each
 * checklist item was verified. The decision endpoint therefore takes the
 * checklist, not a bare "approve" flag, and bulk approval is not expressible.
 */
export const verificationDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected', 'more_info_required']),
    checklist: z
      .array(
        z.object({
          itemKey: z.string().min(1).max(100),
          verified: z.boolean(),
          findings: z.string().max(2000).optional(),
        }),
      )
      .default([]),
    reason: z.string().max(2000).optional(),
  })
  .refine((d) => d.decision === 'approved' || (d.reason?.trim().length ?? 0) > 0, {
    // FR-TVR-006: rejection and more_info_required notify the applicant with the reason.
    message: 'errors.verification.reason_required',
    path: ['reason'],
  });
export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;

export const suspendTeacherSchema = z.object({
  reason: z.string().min(5).max(2000),
});

// ---------------------------------------------------------------------------
// Admin-created accounts
// ---------------------------------------------------------------------------

/** The Admin's first choice: primary school, or secondary school. */
// `schoolTypeSchema` is declared near the top of this file, because teacher
// registration references it before this section.

/**
 * Creating a Student account.
 *
 * The Admin picks the school type, then the class within it (Class 1–6 for
 * primary; Form 1–5, Lower Sixth, Upper Sixth for secondary), then the subjects
 * the student will learn.
 *
 * `schoolType` is carried alongside `levelId` so the server can verify the two
 * agree — a mismatched pair means the form and the catalogue have drifted, and
 * silently trusting the level would put a learner in the wrong school type.
 */
export const adminCreateStudentSchema = z
  .object({
    fullName: z.string().min(2).max(200).trim(),
    /** FR-FAM-006: minor status and the §4.10 safeguarding controls follow from this. */
    dob: z.string().date(),
    schoolType: schoolTypeSchema,
    levelId: z.string().uuid(),
    subjectIds: z.array(z.string().uuid()).min(1, 'errors.student.subjects_required').max(20),
    preferredLanguage: languageSchema.default('en'),

    /**
     * Optional link to an existing Parent, by the phone they registered with.
     * FR-FAM-001: a Student belongs to a Guardian who is financially and legally
     * responsible. A student created without one is standalone until linked.
     */
    guardianPhone: phoneSchema.optional(),

    /**
     * The guardian as written down, for a guardian who has no account here.
     *
     * `guardianPhone` links to a registered Parent and is the better answer
     * whenever there is one — it gives the family a shared view and a payer.
     * But a school office creating thirty accounts on a Monday morning has a
     * name and a number on a paper form, and refusing to record them until the
     * parent has registered loses the only contact detail anyone has.
     *
     * Kept as text deliberately. It is a note about who to call, not an
     * identity: nothing authenticates against it and nothing is authorised by
     * it. When that parent does register, `guardianPhone` is how they are
     * linked properly.
     */
    guardianName: z.string().min(2).max(200).trim().optional(),
    guardianContact: z.string().min(4).max(200).trim().optional(),

    /**
     * The student's own email, for credential delivery and password reset.
     *
     * Optional because a Cameroonian secondary pupil frequently has a phone and
     * no email, and requiring one would exclude exactly the learners this
     * platform is for. One of email or phone must be present when an account is
     * given sign-in, which the refinement below enforces — an account nobody can
     * be told about is an account nobody can use.
     */
    email: emailSchema.optional(),

    /** FR-FAM-003: give the student their own sign-in now, or leave it for later. */
    phone: phoneSchema.optional(),
    /**
     * Omit to have a temporary one generated.
     *
     * Previously required whenever `phone` was given, which meant whoever filled
     * the form chose the child's password and therefore knew it. A generated
     * one is sent to the student and must be replaced on first sign-in
     * (`User.mustChangePassword`), so the person who created the account does
     * not end up holding a working credential for a child.
     */
    password: passwordSchema.optional(),
  })
  .refine((data) => data.phone !== undefined || data.email !== undefined || data.password === undefined, {
    message: 'errors.student.contact_required',
    path: ['phone'],
  });
export type AdminCreateStudentInput = z.infer<typeof adminCreateStudentSchema>;

/**
 * Creating a Teacher account.
 *
 * FR-TVR-005 still holds: approval requires an Admin to affirmatively record
 * that each checklist item was verified. Because the Admin is now also the
 * creator, the checklist is part of this payload rather than a later step —
 * the account is created and verified in one recorded action, and an
 * incomplete checklist leaves the teacher unapproved and unassignable.
 */
export const adminCreateTeacherSchema = z.object({
  fullName: z.string().min(2).max(200).trim(),
  /** FR-AUT-002: the phone is the primary identifier. */
  phone: phoneSchema,
  email: emailSchema.optional(),
  /** The teacher signs in with this; they can change it afterwards. */
  password: passwordSchema,
  preferredLanguage: languageSchema.default('en'),

  /** Primary or secondary school. Every subject below must sit at a matching level. */
  schoolType: schoolTypeSchema,
  subjects: z
    .array(z.object({ subjectId: z.string().uuid(), levelId: z.string().uuid() }))
    .min(1, 'errors.teacher.subjects_required')
    .max(60),

  // Credentials, which is what the checklist attests to.
  bio: z.string().max(2000).optional(),
  yearsExperience: z.number().int().min(0).max(70),
  highestQualification: z.string().min(2).max(200),
  institution: z.string().min(2).max(200),
  qualificationYear: z.number().int().min(1950).max(2100),
  /** FR-PRO-005 / NFR-SEC-003: encrypted at rest, never shown to learners. */
  nationalId: z.string().min(4).max(60),
  languages: z.array(languageSchema).min(1),
  payoutMethod: z.enum(['mtn_momo', 'orange_money']),
  /** One digit and above — see `teacherApplicationSchema`. Kept identical so the
   *  admin form cannot reject a wallet the applicant's own form accepts. */
  payoutWallet: z.string().min(1).max(30),

  /**
   * FR-TVR-005: each item recorded affirmatively, with findings. Supplying an
   * incomplete checklist is allowed — it simply does not approve the teacher.
   */
  checklist: z
    .array(
      z.object({
        itemKey: z.string().min(1).max(100),
        verified: z.boolean(),
        findings: z.string().max(2000).optional(),
      }),
    )
    .default([]),
});
export type AdminCreateTeacherInput = z.infer<typeof adminCreateTeacherSchema>;

// ---------------------------------------------------------------------------
// File upload — SI-006, FR-TVR-002, FR-FIL-001..005
// ---------------------------------------------------------------------------

/**
 * FR-TVR-002: certificates, diplomas, ID and teaching authorisation in PDF,
 * JPG, PNG or HEIC, up to 10 MB per file.
 *
 * These values are declared by the client, so they are treated as a hint that
 * lets an obviously bad upload be refused before it starts. The authoritative
 * check runs on confirmation, against what storage actually received.
 */
export const signTeacherDocumentSchema = z.object({
  type: z.enum([
    'national_id',
    'passport',
    'degree_certificate',
    'diploma',
    'teaching_authorisation',
    /**
     * FR-TVR-005: the spoken introduction goes through this same path.
     *
     * The recorder, the upload service and the Prisma enum all had it; only
     * this list did not, so every "Use this recording" was refused at the door
     * with a 400 naming `type` and `mimeType` — a feature that was complete
     * everywhere except the one place that decides whether the request is
     * allowed to start.
     */
    'intro_video',
    'other',
  ]),
  fileName: z.string().min(1).max(300),
  mimeType: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    // Kept in step with TEACHER_VIDEO_KINDS in the API's file-policy.
    'video/webm',
    'video/mp4',
    'video/quicktime',
  ]),
  /**
   * The ceiling here is the *largest* any teacher document may be — 60 MB, for
   * video. The precise per-type limit (10 MB for a page, 60 MB for a recording)
   * belongs to the service, which knows which kind it is looking at; a flat
   * 10 MB here refused a perfectly valid three-minute video before that check
   * ever ran.
   */
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(60 * 1024 * 1024, 'errors.file.too_large'),
  /** FR-TVR-007: an expiry drives the 30-day re-verification prompt. */
  expiresOn: z.string().date().optional(),
});
export type SignTeacherDocumentInput = z.infer<typeof signTeacherDocumentSchema>;

/**
 * FR-TVR-004: a reviewer removing a document from an application.
 *
 * The reason is mandatory and has a floor, because this is the one action here
 * that destroys something. The audit entry outlives the file — `audit_log` is a
 * no-delete table — and a one-character reason would make that record useless
 * to whoever reads it a year later.
 */
export const removeTeacherDocumentSchema = z.object({
  reason: z.string().min(4).max(500),
});
export type RemoveTeacherDocumentInput = z.infer<typeof removeTeacherDocumentSchema>;

/**
 * Which classes and subjects a teacher may teach.
 *
 * Sent as the complete set, not as add-one/remove-one: the dialog shows every
 * pairing at once and Update means "this is the list now". A partial API would
 * make removing an assignment a separate call the screen never has to think
 * about, and leave the two able to disagree.
 *
 * Deliberately no cap. The same subject in several classes is the normal case —
 * Form One Biology and Form Four Biology are one teacher's ordinary week — and
 * an arbitrary ceiling would refuse a real timetable.
 *
 * The two-period limit is a *timetable* rule and still applies per class; being
 * assigned ten subjects does not let anyone teach eleven periods of one.
 */
export const assignTeacherSubjectsSchema = z.object({
  assignments: z
    .array(
      z.object({
        levelId: z.string().uuid(),
        subjectId: z.string().uuid(),
        /** The admin's special permission to exceed the weekly period limit. */
        periodAllowance: z.number().int().min(1).max(20).optional(),
      }),
    )
    .max(400),
});
export type AssignTeacherSubjectsInput = z.infer<typeof assignTeacherSubjectsSchema>;

/**
 * Placing a learner in a class, with the subjects they will offer.
 *
 * One call rather than two, because they are one decision: a learner moved to
 * Form 1 whose subjects still belong to Class 6 has a timetable made of
 * lessons that are not taught to them. Setting the level without the subjects
 * is the state this exists to prevent.
 *
 * The subject list is the complete set, for the same reason as the teacher's:
 * the dialog shows every subject of the chosen class at once, and Update means
 * "this is what they offer now".
 */
export const assignLearnerClassSchema = z.object({
  levelId: z.string().uuid(),
  /**
   * At least one. A learner in a class offering nothing sees an empty
   * timetable, no lessons and no exams, which reads as the platform being
   * broken rather than as an incomplete assignment.
   */
  subjectIds: z.array(z.string().uuid()).min(1).max(40),
});
export type AssignLearnerClassInput = z.infer<typeof assignLearnerClassSchema>;

/**
 * Removing accounts from the platform, one selection at a time.
 *
 * DAT-006: this is a soft delete — `status: 'deleted'` and `deletedAt` — and
 * the database will not permit anything else, because the audit trail
 * references the user and `audit_log` cannot be deleted from. So an account
 * disappears from every roster and can no longer sign in, while the record of
 * what it did survives. Lawful erasure under §7.3 is a separate process.
 *
 * Capped at 100. The screen deletes what an admin ticked on one page, and an
 * unbounded list is how a mis-sent request removes a whole school.
 */
export const deleteUsersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  /** Recorded on every entry, because "deleted by an admin" answers nothing. */
  reason: z.string().min(4).max(500),
});
export type DeleteUsersInput = z.infer<typeof deleteUsersSchema>;

// ---------------------------------------------------------------------------
// Timetable — BUILD-PLAN Phase 1
// ---------------------------------------------------------------------------

/**
 * A teacher proposing the hours they will teach.
 *
 * The bounds here are the coarse gate; `validateTimetableSlot` in
 * `timetable.ts` holds the real rule (teaching day, minimum and maximum
 * length) and is applied by the service, so the form and the API agree without
 * the rule being written twice.
 */
export const proposeTimetableSlotSchema = z.object({
  levelId: z.string().uuid(),
  subjectId: z.string().uuid(),
  /** A private arrangement has no cohort. */
  cohortId: z.string().uuid().optional(),
  /**
   * 1–7. Which of these a class may actually use is `SCHOOL_WEEK_DAYS`, checked
   * by the service — the schema cannot read configuration, and hard-coding 5
   * here would make switching to a 24/6 week a code change.
   */
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  /** Day or evening. `private` is filled by an admin, never claimed here. */
  session: z.enum(['day', 'evening']).optional(),
});
export type ProposeTimetableSlotInput = z.infer<typeof proposeTimetableSlotSchema>;

/**
 * Correcting a slot that was claimed at the wrong day or hour.
 *
 * Only when and where — never which subject or which class. Changing those is
 * a different claim against a different allowance, and letting one edit slide
 * into the other would route around the per-subject limit: claim Biology, then
 * "edit" it into a second period of Mathematics.
 *
 * A teacher who chose the wrong subject withdraws the slot and claims again,
 * which costs one tap and keeps the rules countable.
 */
/** An admin approving or refusing a proposed time change. */
export const decideTimetableEditSchema = z.object({
  approve: z.boolean(),
});
export type DecideTimetableEditInput = z.infer<typeof decideTimetableEditSchema>;

export const editTimetableSlotSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  session: z.enum(['day', 'evening']).optional(),
});
export type EditTimetableSlotInput = z.infer<typeof editTimetableSlotSchema>;

/**
 * A staff correction to a confirmed timetable slot.
 *
 * Unlike a teacher's edit this may also replace the teacher or subject.  It is
 * deliberately a separate DTO: a teacher must never be able to turn a claim
 * for one approved subject into a claim for another by changing the request
 * body sent to their own endpoint.
 */
export const adminEditTimetableSlotSchema = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});
export type AdminEditTimetableSlotInput = z.infer<typeof adminEditTimetableSlotSchema>;

/** A learner-owned practice group. The creator counts towards the ten seats. */
export const createStudyGroupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  memberUserIds: z.array(z.string().uuid()).max(9).default([]),
});
export type CreateStudyGroupInput = z.infer<typeof createStudyGroupSchema>;

export const updateStudyGroupMembersSchema = z.object({
  memberUserIds: z.array(z.string().uuid()).min(1).max(9),
});
export type UpdateStudyGroupMembersInput = z.infer<typeof updateStudyGroupMembersSchema>;

export const setStudyGroupLockSchema = z.object({ locked: z.boolean() });
export type SetStudyGroupLockInput = z.infer<typeof setStudyGroupLockSchema>;

export const setStudyGroupMemberPermissionSchema = z.object({
  mayPost: z.boolean().optional(),
  allowImages: z.boolean().optional(),
  allowVideos: z.boolean().optional(),
  allowVoice: z.boolean().optional(),
  allowDocuments: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'errors.validation',
});
export type SetStudyGroupMemberPermissionInput = z.infer<typeof setStudyGroupMemberPermissionSchema>;

/**
 * Staff confirming or refusing a proposal.
 *
 * Confirmation is what makes a slot count — earnings are counted inside one and
 * a live session starts from one — so the permission sits on this endpoint and
 * not on the proposal (BUILD-PLAN Phase 1, step 3).
 */
/**
 * An hourly rate in XAF, or `null` to fall back to the platform default.
 *
 * Whole francs: XAF has no minor unit, so a decimal here would be a rounding
 * question nobody asked. Capped at ten million an hour — not a real rate, but a
 * typo of two extra zeros on a payroll figure is worth catching at the boundary
 * rather than in a payout run.
 */
const hourlyRateSchema = z.number().int().min(0).max(10_000_000).nullable().optional();

export const decideTimetableSlotSchema = z
  .object({
    /*
     * `on_hold` suspends a period that is already timetabled.
     *
     * A note is required for it as it is for a refusal: the class sees this as
     * a Free Period and both the teacher and the learners are owed the reason.
     */
    decision: z.enum(['confirmed', 'rejected', 'on_hold']),
    note: z.string().max(500).optional(),
    /**
     * What this period pays, per hour, in XAF. Omit to leave it as it is.
     *
     * Set at the moment of approval because that is when an admin is already
     * looking at who teaches what to whom — "admin sets the teacher's hourly
     * rate after timetable approval" is one action in the brief and should be
     * one action on the screen.
     *
     * `null` is meaningful and distinct from omitting: it clears a specific
     * rate and returns the period to the platform default. Without that there
     * would be no way back from a rate set by mistake except guessing what the
     * default currently is and typing it in, which then stops tracking it.
     */
    hourlyRateXaf: hourlyRateSchema,
  })
  .refine((d) => d.decision === 'confirmed' || (d.note?.trim().length ?? 0) > 0, {
    message: 'errors.timetable.note_required',
    path: ['note'],
  });

/**
 * Changing what a period pays, without re-deciding it.
 *
 * Separate from the decision above because a rate correction is not an approval
 * and must not read as one in the audit trail: a period already timetabled
 * stays timetabled, the class is not disturbed, and only the money changes.
 */
export const setSlotRateSchema = z.object({ hourlyRateXaf: hourlyRateSchema });
export type SetSlotRateInput = z.infer<typeof setSlotRateSchema>;
export type DecideTimetableSlotInput = z.infer<typeof decideTimetableSlotSchema>;

// ---------------------------------------------------------------------------
// Lessons — BUILD-PLAN Phase 2
// ---------------------------------------------------------------------------

/**
 * A teacher publishing one lesson file to a class.
 *
 * `levelId` and `subjectId` are the whole access rule. FR-MAT-002 serves a
 * learner the materials for their own level, so choosing the class here is what
 * decides who receives the lesson — there is no separate audience to pick, and
 * no list of learner ids that could drift out of step with the register.
 *
 * The size ceiling is `LESSON_MAX_BYTES` in the API's `file-policy.ts`, and this
 * is the coarse gate in front of it: the same 100 MB, so a recorded lesson is
 * not refused here by a limit written for a certificate.
 */
export const publishLessonSchema = z.object({
  levelId: z.string().uuid(),
  subjectId: z.string().uuid(),
  /** What the learner sees in the list. Their words, not the file's name. */
  title: z.string().min(2).max(300),
  /** Optional, and genuinely optional — a lesson need not belong to a unit. */
  topic: z.string().max(200).optional(),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024, 'errors.file.too_large'),
});
export type PublishLessonInput = z.infer<typeof publishLessonSchema>;

// ---------------------------------------------------------------------------
// Catalogue — FR-PRO-001/002/006
// ---------------------------------------------------------------------------

export const browseTeachersSchema = z.object({
  subjectId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
  language: languageSchema.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  availableWeekday: z.coerce.number().int().min(0).max(6).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export interface SessionUser {
  id: string;
  fullName: string;
  roles: (typeof ROLES)[number][];
  preferredLanguage: 'en' | 'fr';
  phoneVerified: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
}
