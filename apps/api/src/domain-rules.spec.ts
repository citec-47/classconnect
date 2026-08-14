import {
  normalisePhone,
  isValidCameroonMobile,
  maskPhone,
  maskEmail,
  isMinor,
  ageInYears,
  daysUntil18,
  permissionsFor,
  hasPermission,
  requiresMfa,
  isStaff,
  t,
  languageFromHeader,
  registerSchema,
  verificationDecisionSchema,
  createLearnerSchema,
  catalogues,
} from '@classconnect/shared';

describe('phone — FR-AUT-002: E.164 is the primary identifier', () => {
  it('normalises a local Cameroonian mobile to +237…', () => {
    expect(normalisePhone('677123456')?.e164).toBe('+237677123456');
    expect(normalisePhone('6 77 12 34 56')?.e164).toBe('+237677123456');
    expect(normalisePhone('+237677123456')?.e164).toBe('+237677123456');
  });

  it('rejects input that cannot be a number', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
    expect(normalisePhone('12')).toBeNull();
  });

  it('identifies a Cameroonian mobile, which OTP delivery requires', () => {
    expect(isValidCameroonMobile('677123456')).toBe(true);
    // A landline cannot receive an SMS, so it must not pass as an identifier.
    expect(isValidCameroonMobile('233421234')).toBe(false);
  });
});

describe('masking — NFR-SEC-009: no full phone number or email in logs', () => {
  it('masks the middle of a phone number', () => {
    const masked = maskPhone('+237677123456');
    expect(masked).toContain('3456');
    expect(masked).not.toContain('677123');
    expect(masked).toMatch(/\*/);
  });

  it('masks the local part of an email', () => {
    expect(maskEmail('amina@example.com')).toBe('a****@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('age — FR-FAM-006: minor status is derived from date of birth', () => {
  const asOf = new Date('2026-08-06T00:00:00Z');

  it('computes age without counting an unreached birthday', () => {
    expect(ageInYears(new Date('2008-08-07T00:00:00Z'), asOf)).toBe(17);
    expect(ageInYears(new Date('2008-08-06T00:00:00Z'), asOf)).toBe(18);
    expect(ageInYears(new Date('2008-08-05T00:00:00Z'), asOf)).toBe(18);
  });

  it('treats the 18th birthday itself as adult', () => {
    expect(isMinor(new Date('2008-08-06T00:00:00Z'), asOf)).toBe(false);
    expect(isMinor(new Date('2008-08-07T00:00:00Z'), asOf)).toBe(true);
  });

  it('counts down to the 18th birthday for the conversion prompt', () => {
    expect(daysUntil18(new Date('2008-09-05T00:00:00Z'), asOf)).toBe(30);
  });
});

describe('roles — FR-RBA-001 and FR-AUT-009', () => {
  it('gives a parent the family permissions and nothing administrative', () => {
    expect(hasPermission(['parent'], 'learner:read:own')).toBe(true);
    expect(hasPermission(['parent'], 'learner:credentials:manage')).toBe(true);
    expect(hasPermission(['parent'], 'teacher:verification:decide')).toBe(false);
    expect(hasPermission(['parent'], 'payout:approve')).toBe(false);
  });

  it('does not let a parent create a Student account', () => {
    // Student and Teacher accounts are created by an Admin only. A parent
    // manages the children linked to them; they cannot bring one into being.
    expect(hasPermission(['parent'], 'learner:create')).toBe(false);
    expect(hasPermission(['parent'], 'student:create')).toBe(false);
  });

  it('reserves account creation to the administrative roles', () => {
    for (const role of ['parent', 'student', 'adult_learner', 'teacher', 'support_agent'] as const) {
      expect(hasPermission([role], 'student:create')).toBe(false);
      expect(hasPermission([role], 'teacher:create')).toBe(false);
    }
    expect(hasPermission(['admin_ops'], 'student:create')).toBe(true);
    expect(hasPermission(['admin_ops'], 'teacher:create')).toBe(true);
    expect(hasPermission(['super_admin'], 'student:create')).toBe(true);
    expect(hasPermission(['super_admin'], 'teacher:create')).toBe(true);
    // Finance approves payouts; it does not create the people who receive them.
    expect(hasPermission(['admin_finance'], 'teacher:create')).toBe(false);
  });

  it('leaves a teacher able to supply documents but not to apply', () => {
    // FR-TVR-007: re-verification still needs the teacher to upload documents.
    expect(hasPermission(['teacher'], 'teacher:document:upload:own')).toBe(true);
    expect(hasPermission(['teacher'], 'teacher:create')).toBe(false);
  });

  it('separates operations from finance', () => {
    expect(hasPermission(['admin_ops'], 'teacher:verification:decide')).toBe(true);
    expect(hasPermission(['admin_ops'], 'payout:approve')).toBe(false);
    expect(hasPermission(['admin_finance'], 'payout:approve')).toBe(true);
    expect(hasPermission(['admin_finance'], 'teacher:verification:decide')).toBe(false);
  });

  /*
   * Customer service reviews teacher applications alongside Ops.
   *
   * This asserted the opposite until the desk was asked to share the queue: an
   * applicant waiting on a single team waits days, and verification was the
   * bottleneck. The control that protects learners is not *who* clicks approve
   * — it is FR-TVR-005, which still requires every mandatory checklist item to
   * be recorded affirmatively, one applicant at a time, with findings, and no
   * bulk action anywhere on the screen. Every decision stays attributed and
   * audited (FR-TVR-010).
   *
   * What a support agent still may not do is below, and that is the line that
   * matters: they cannot pay anyone, suspend anyone, or change configuration.
   */
  it('lets a support agent decide a verification, but touch nothing financial', () => {
    expect(hasPermission(['support_agent'], 'teacher:verification:read')).toBe(true);
    expect(hasPermission(['support_agent'], 'teacher:verification:decide')).toBe(true);

    expect(hasPermission(['support_agent'], 'payout:approve')).toBe(false);
    expect(hasPermission(['support_agent'], 'finance:read')).toBe(false);
    expect(hasPermission(['support_agent'], 'teacher:suspend')).toBe(false);
    expect(hasPermission(['support_agent'], 'config:write')).toBe(false);
  });

  it('gives the super admin every permission', () => {
    const all = permissionsFor(['super_admin']);
    expect(all.has('payout:approve')).toBe(true);
    expect(all.has('config:write')).toBe(true);
    expect(all.has('teacher:suspend')).toBe(true);
  });

  it('requires MFA of every staff role and no customer role', () => {
    for (const role of ['support_agent', 'admin_ops', 'admin_finance', 'super_admin'] as const) {
      expect(requiresMfa([role])).toBe(true);
      expect(isStaff([role])).toBe(true);
    }
    for (const role of ['parent', 'student', 'adult_learner', 'teacher'] as const) {
      expect(requiresMfa([role])).toBe(false);
      expect(isStaff([role])).toBe(false);
    }
  });

  it('unions permissions across several roles', () => {
    const both = permissionsFor(['admin_ops', 'admin_finance']);
    expect(both.has('teacher:verification:decide')).toBe(true);
    expect(both.has('payout:approve')).toBe(true);
  });
});

describe('validation — FR-AUT-001: who may register', () => {
  const base = {
    fullName: 'Amina Nkeng',
    phone: '677123456',
    preferredLanguage: 'en' as const,
    acceptedTerms: true as const,
  };

  it('accepts parent and adult learner', () => {
    expect(registerSchema.safeParse({ ...base, role: 'parent' }).success).toBe(true);
    expect(
      registerSchema.safeParse({ ...base, role: 'adult_learner', dob: '2000-01-01' }).success,
    ).toBe(true);
  });

  it('refuses self-registration as a student or a teacher', () => {
    // Both are Admin-created. The roles are not expressible on this endpoint at
    // all, so the restriction cannot be bypassed by crafting a request.
    expect(registerSchema.safeParse({ ...base, role: 'student' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, role: 'teacher' }).success).toBe(false);
  });

  it('requires a date of birth from an adult learner', () => {
    expect(registerSchema.safeParse({ ...base, role: 'adult_learner' }).success).toBe(false);
  });

  it('requires acceptance of the terms — NFR-PRV-002', () => {
    const result = registerSchema.safeParse({ ...base, role: 'parent', acceptedTerms: false });
    expect(result.success).toBe(false);
  });

  it('requires at least one identifier', () => {
    const { phone: _ignored, ...withoutPhone } = base;
    expect(registerSchema.safeParse({ ...withoutPhone, role: 'parent' }).success).toBe(false);
  });

  it('normalises the phone to E.164 at the boundary', () => {
    const result = registerSchema.safeParse({ ...base, role: 'parent' });
    expect(result.success && result.data.phone).toBe('+237677123456');
  });
});

describe('validation — FR-TVR-005/006: verification decisions', () => {
  it('requires a reason when rejecting', () => {
    expect(
      verificationDecisionSchema.safeParse({ decision: 'rejected', checklist: [] }).success,
    ).toBe(false);
  });

  it('requires a reason when asking for more information', () => {
    expect(
      verificationDecisionSchema.safeParse({ decision: 'more_info_required', checklist: [] })
        .success,
    ).toBe(false);
  });

  it('does not demand a reason to approve', () => {
    expect(
      verificationDecisionSchema.safeParse({
        decision: 'approved',
        checklist: [{ itemKey: 'identity', verified: true }],
      }).success,
    ).toBe(true);
  });

  it('carries findings per checklist item', () => {
    const result = verificationDecisionSchema.safeParse({
      decision: 'approved',
      checklist: [{ itemKey: 'identity', verified: true, findings: 'Matches the applicant.' }],
    });
    expect(result.success && result.data.checklist[0]?.findings).toBe('Matches the applicant.');
  });
});

describe('validation — FR-FAM-001: creating a learner', () => {
  it('requires a name and a date of birth', () => {
    expect(createLearnerSchema.safeParse({ fullName: 'Junior' }).success).toBe(false);
    expect(
      createLearnerSchema.safeParse({ fullName: 'Junior Nkeng', dob: '2011-04-15' }).success,
    ).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      createLearnerSchema.safeParse({ fullName: 'Junior Nkeng', dob: '15/04/2011' }).success,
    ).toBe(false);
  });
});

describe('i18n — NFR-LOC-001/002 and §9.2 acceptance criterion 8', () => {
  it('resolves a key in both languages', () => {
    expect(t('en', 'auth.signIn')).toBe('Sign in');
    expect(t('fr', 'auth.signIn')).toBe('Se connecter');
  });

  it('interpolates parameters', () => {
    expect(t('en', 'errors.otp.incorrect', { remaining: 3 })).toContain('3');
    expect(t('fr', 'errors.otp.incorrect', { remaining: 3 })).toContain('3');
  });

  it('returns the key itself when a translation is missing, so gaps are visible', () => {
    expect(t('en', 'nothing.here.at.all')).toBe('nothing.here.at.all');
  });

  it('derives the language from Accept-Language', () => {
    expect(languageFromHeader('fr-CM,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(languageFromHeader('en-GB,en;q=0.9')).toBe('en');
    expect(languageFromHeader(null)).toBe('en');
    expect(languageFromHeader('de-DE')).toBe('en');
  });

  it('has no untranslated string: every English leaf has a French counterpart', () => {
    // §9.2 criterion 8: both languages complete, with no untranslated string in
    // any user-facing surface. The type system enforces the shape; this asserts
    // the French value is not simply a copy of the English one.
    const identical: string[] = [];
    walk(catalogues.en, catalogues.fr, '', identical);

    /**
     * A handful of strings are legitimately identical across the two languages.
     * Each is listed individually rather than matched by pattern, so a genuinely
     * untranslated string can never hide behind a rule like "short strings are
     * fine".
     */
    const allowed = new Set([
      // The product name, the language names as they appear in their own
      // language, and a person's name in the sample verification record.
      'common.appName',
      'common.english',
      'common.french',
      'landing.recordTeacher',
      'teacher.application', // "Teaching application" / "Candidature d’enseignant" differ; guard anyway

      // Payment brands. Translating "Orange Money" would make it unfindable in
      // the app a payer actually holds (FR-PAY-011 lists these by name).
      'payments.methodMtnMomo',
      'payments.methodOrangeMoney',
      'payments.methodVisa',
      'payments.methodMastercard',
      'support.channelWhatsapp',

      // An acronym used unchanged in Cameroonian French banking (FR-ERN-010).
      'payments.kycComplete',

      // Words French spells exactly as English does. "Documents", "Agents",
      // "Ticket" and "Action" are the correct French, not a missing translation.
      'approvals.documents',
      'approvals.documentsCount',
      'support.agents',
      'support.ticket',
      'audit.filterAction',
      // "Type" — as in the type of lesson. The same word, spelled the same way,
      // in both languages.
      'live.kind',

      /*
       * Learner-surface units. "min" is the same abbreviation either side of the
       * language, and "question" is spelled identically in French. Listed
       * individually rather than skipped by a rule like "short strings are
       * fine", so a genuinely untranslated string still cannot hide here.
       */
      'student.unit.minutes',
      'student.unit.questions',
      'student.unit.oneQuestion',

      /*
       * The teacher surface, on the same principle as the entries above.
       *
       * "Actions", "Classes", "Messages", "Coefficient", "Total", "Photo" and
       * "Parent" are each spelled identically in French — the correct French,
       * not an oversight. "Question" likewise, inside the interpolated string.
       */
      'common.actions',
      'teacher.classes.title',
      'teacherNav.classes',
      'teacherNav.messages',
      'adminNav.messages',
      'adminMessages.title',
      'teacherReports.coefficient',
      'teacherExams.question',
      'student.tab.messages',
      'student.messages.title',
      'student.fees.total',
      'student.messages.attachPhoto',
      'teacherMessages.role.guardian',

      /*
       * Not words at all, so there is nothing to translate: the product name,
       * two marking glyphs, an em dash standing for "no mark yet", and a
       * placeholder that is substituted before anyone reads it.
       */
      'teacherMessages.role.admin',
      'student.messages.support',
      'teacherExams.correctMark',
      'teacherExams.wrongMark',
      'teacherReports.notYet',
      'student.messages.attachmentSize',

      /*
       * Units. `min`, `minutes` and `questions` are the same abbreviation and
       * the same words in French; only the surrounding number changes.
       */
      // An amount and a currency code. FCFA is not a word either language
      // translates, and the number is substituted before anyone reads it.
      'live.countdown.earned',
      'teacherRecordings.length',
      'student.attendance.minutes',
      'student.classes.minutes',
      'student.recordings.duration',
      'student.exams.durationMin',
      'student.exams.questions',
    ]);
    const unexpected = identical.filter((path) => !allowed.has(path));
    expect(unexpected).toEqual([]);
  });
});

function walk(
  en: unknown,
  fr: unknown,
  path: string,
  identical: string[],
): void {
  if (typeof en === 'string') {
    if (en === fr) identical.push(path);
    return;
  }
  if (typeof en !== 'object' || en === null) return;

  for (const [key, value] of Object.entries(en as Record<string, unknown>)) {
    const next = (fr as Record<string, unknown>)[key];
    // A missing key is a compile error via the Messages type, but assert it too
    // so a runtime catalogue swap cannot slip past.
    expect(next).toBeDefined();
    walk(value, next, path ? `${path}.${key}` : key, identical);
  }
}
