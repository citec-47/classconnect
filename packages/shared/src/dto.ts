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
  /** FR-PRO-005 / NFR-SEC-003: encrypted at rest, never returned to learners. */
  nationalId: z.string().min(4).max(60),
  address: z.string().max(300).optional(),
  languages: z.array(languageSchema).min(1),
  subjects: z
    .array(z.object({ subjectId: z.string().uuid(), levelId: z.string().uuid() }))
    .min(1, 'errors.teacher.subjects_required')
    .max(60),
  payoutMethod: z.enum(['mtn_momo', 'orange_money']),
  payoutWallet: z.string().min(6).max(30),
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

    /** FR-FAM-003: give the student their own sign-in now, or leave it for later. */
    phone: phoneSchema.optional(),
    password: passwordSchema.optional(),
  })
  .refine((data) => data.phone === undefined || data.password !== undefined, {
    message: 'errors.password.required_for_signin',
    path: ['password'],
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
  payoutWallet: z.string().min(6).max(30),

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
    'other',
  ]),
  fileName: z.string().min(1).max(300),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/heic']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'errors.file.too_large'),
  /** FR-TVR-007: an expiry drives the 30-day re-verification prompt. */
  expiresOn: z.string().date().optional(),
});
export type SignTeacherDocumentInput = z.infer<typeof signTeacherDocumentSchema>;

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
