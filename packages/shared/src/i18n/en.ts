/**
 * English message catalogue.
 *
 * NFR-LOC-002: no user-visible string may be hard-coded — every string the user
 * can read originates here or in its French counterpart.
 * NFR-USA-002: plain language at roughly a Grade 8 reading level.
 * NFR-USA-004: errors say what went wrong, why, and what to do next.
 */
export const en = {
  common: {
    appName: 'ClassConnect',
    tagline: 'Learn with verified teachers, anywhere in Cameroon',
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    loading: 'Loading…',
    search: 'Search',
    filter: 'Filter',
    none: 'None',
    /* Reads better than a dash, which a screen reader announces as nothing. */
    notRecorded: 'Not recorded',
    yes: 'Yes',
    no: 'No',
    required: 'Required',
    optional: 'Optional',
    signOut: 'Sign out',
    language: 'Language',
    english: 'English',
    french: 'Français',
    skip: 'Skip',
    retry: 'Try again',
    offline: 'You are offline. We saved your place and will retry when you reconnect.',
    skipToContent: 'Skip to content',
    everyTeacherChecked: 'Every teacher is checked by hand before their first lesson.',
    notAnExamBody:
      'ClassConnect is a preparation service. We are not the GCE Board or an examining body.',
  },

  /**
   * Landing page copy.
   *
   * Written to NFR-USA-002 — plain language at roughly a Grade 8 reading level —
   * and deliberately specific. Every claim here maps to something the system
   * actually does: the prices are FR-PAY-002, the levels are FR-PRO-001, the
   * safeguarding points are §4.10, the degradation ladder is FR-LIV-009.
   * Nothing is aspirational.
   */
  landing: {
    eyebrow: 'Cameroon · English and French',
    headline: 'Live lessons with teachers we check ourselves.',
    subhead:
      'ClassConnect puts primary, secondary and GCE learners in front of qualified teachers. On the phone you already own, over the connection you actually have.',
    ctaPrimary: 'Create a parent account',
    ctaSecondary: 'I already have an account',
    ctaNote: 'Free to create. You only pay when you choose a plan.',

    // The hero panel reproduces a real verification record, so the claim in the
    // headline is shown rather than asserted. The items are the six in
    // VERIFICATION_CHECKLIST.
    recordTitle: 'Verification record',
    recordTeacher: 'Grace Ndifor',
    recordSubjects: 'Mathematics · Form 1 to Form 5',
    recordCheck1: 'Identity document matches the applicant',
    recordCheck2: 'Qualification certificate genuine and legible',
    recordCheck3: 'Awarding institution recognised',
    recordCheck4: 'Subjects match the qualification',
    recordCheck5: 'Payout name matches the identity document',
    recordFooter: 'Approved by an administrator. Every item recorded with who checked it.',

    proofVerified: 'Every certificate checked by a person',
    proofVerifiedHint: 'Not an automated form. An administrator reads the document.',
    proofBandwidth: 'Works at 400 kbps',
    proofBandwidthHint: 'Lessons hold together on a weak 3G signal.',
    proofPayment: 'MTN MoMo and Orange Money',
    proofPaymentHint: 'Pay the way you already pay for everything else.',

    howTitle: 'How it works',
    howLead: 'Three steps. Our team does the setting up, so you do not have to.',
    how1Title: 'Tell us about your learner',
    how1Body:
      'Their name, their class, and the subjects they need. Our staff create the account and link it to you. That way nobody can add a child to the platform except us.',
    how2Title: 'We match a verified teacher',
    how2Body:
      'Someone who teaches that subject, at that class, and whose qualification we have already checked by hand.',
    how3Title: 'Lessons happen in the app',
    how3Body:
      'Live video and a shared whiteboard. Homework goes in, marked work comes back, and you can see all of it.',

    levelsTitle: 'From Class 1 to Upper Sixth',
    levelsLead:
      'We follow the Cameroonian school structure, including preparation for the GCE Ordinary and Advanced Level.',
    levelsPrimary: 'Primary school',
    levelsPrimaryList: 'Class 1 · Class 2 · Class 3 · Class 4 · Class 5 · Class 6',
    levelsSecondary: 'Secondary school',
    levelsSecondaryList:
      'Form 1 · Form 2 · Form 3 · Form 4 · Form 5 · Lower Sixth · Upper Sixth',
    levelsExam: 'Examination preparation',
    levelsExamList: 'GCE Ordinary Level · GCE Advanced Level · Adult GCE',
    subjectsTitle: 'Subjects',
    subjectsList:
      'Mathematics · Further Mathematics · English Language · French · Literature in English · Physics · Chemistry · Biology · Computer Science · Geography · History · Economics · Commerce · Accounting · Citizenship Education · Religious Studies',

    safetyTitle: 'What we do before a teacher meets your child',
    safetyLead:
      'This is the part we are strictest about, and the part most platforms skip.',
    safety1: 'An administrator reads the identity document and the certificate, confirms the awarding institution, and records what they found. A teacher who fails any one of those checks cannot be given a learner.',
    safety2: 'All contact stays inside ClassConnect. Personal phone numbers, emails and social handles are never shared in either direction, and the app removes them from messages automatically.',
    safety3: 'One-to-one lessons with children are recorded by default, and everyone in the lesson is told, at booking and again when they join.',
    safety4: 'You can open every message, recording, piece of feedback and mark belonging to your child. There is a "report a concern" button on every lesson and every message thread.',

    connectionTitle: 'Built for the connection you have',
    connectionLead:
      'Most learning platforms assume fibre. This one assumes a shared handset on a bad afternoon.',
    connection1: 'When the signal drops, video quality falls first. Then the learner’s camera switches off, then the teacher’s. Sound, whiteboard and chat keep working throughout.',
    connection2: 'An audio-only mode you can choose before or during a lesson, for about 40 kbps.',
    connection3: 'Your timetable, saved materials and marked homework stay readable with no signal at all.',
    connection4: 'If you are disconnected, you rejoin where you left off, with the whiteboard and chat intact.',

    pricingTitle: 'What it costs',
    pricingLead: 'One subscription per learner. Cancel whenever you want to.',
    pricingMonthly: 'per month',
    pricingYearly: 'per year',
    pricingPrimary: 'Primary',
    pricingSecondary: 'Secondary',
    pricingExam: 'Examination classes',
    pricingScience: 'Science classes',
    pricingNote:
      'Pay with MTN Mobile Money, Orange Money, Visa or Mastercard. Every payment gets a numbered receipt you can download.',

    faqTitle: 'Questions parents ask',
    faq1Q: 'Can I set up my child’s account myself?',
    faq1A: 'No, and that is deliberate. Only ClassConnect staff create student accounts. It means every learner on the platform has been through us, and it is the same reason we check every teacher by hand. Contact us with your child’s name and class and we will set it up and link it to you.',
    faq2Q: 'What if the lesson is bad?',
    faq2A: 'Tell us. You can rate every lesson, and you can report a concern from any lesson or message. We suspend teachers when we need to. That cancels their upcoming lessons, tells the affected families, and freezes their payments while we look into it.',
    faq3Q: 'Do you guarantee GCE results?',
    faq3A: 'No. Nobody honestly can. We are a preparation service, not an examining body, and we have no connection to the GCE Board. What we give you is past papers, timed mocks, marked work and an honest picture of where your child stands.',
    faq4Q: 'Which languages?',
    faq4A: 'English and French, both complete: the lessons, the app, the receipts, the messages and our support. Switch at any time from any screen.',

    finalTitle: 'Start with one subject',
    finalBody:
      'Create your parent account, tell us your child’s class, and we will do the rest.',
  },

  nav: {
    home: 'Home',
    timetable: 'Timetable',
    homework: 'Homework',
    progress: 'Progress',
    help: 'Help',
    children: 'My children',
    students: 'My students',
    verification: 'Verification',
    people: 'People',
    money: 'Money',
  },

  auth: {
    signIn: 'Sign in',
    signUp: 'Create an account',
    signInSubtitle: 'Welcome back. Sign in to continue.',
    chooseRole: 'How will you use ClassConnect?',
    roleParent: 'I am a parent',
    roleParentHint: 'Set up and pay for your child’s lessons, and follow their progress.',
    roleAdultLearner: 'I am studying myself',
    roleAdultLearnerHint: 'You are 18 or older and manage your own account.',
    roleTeacher: 'I want to teach',
    roleTeacherHint: 'Apply to teach. We check every teacher before their first lesson.',
    teacherVerificationNote:
      'After you sign up, upload your certificate and identity document. An administrator checks them by hand, and you can be given learners once that is done.',
    fullName: 'Full name',
    phone: 'Phone number',
    phoneHint: 'We send your code by SMS. Use the number on this phone.',
    phoneOrEmail: 'Phone number or email',
    phoneOrEmailHint: 'Whichever you signed up with.',
    useCodeInstead: 'Sign in with a code instead',
    usePasswordInstead: 'Sign in with a password instead',
    setPassword: 'Choose a password',
    setPasswordHint: 'Optional, but it lets you sign in without waiting for an SMS.',
    email: 'Email address',
    password: 'Password',
    passwordHint: 'At least 10 characters. A short sentence works well.',
    dob: 'Date of birth',
    sendCode: 'Send me a code',
    enterCode: 'Enter your code',
    codeSentTo: 'We sent a 6-digit code to {destination}.',
    codeExpiresIn: 'The code expires in {minutes} minutes.',
    resendCode: 'Send a new code',
    resendIn: 'You can ask for a new code in {seconds}s',
    tryWhatsApp: 'Send the code on WhatsApp instead',
    verify: 'Verify',
    acceptTerms: 'I accept the Terms of Service and the Privacy Notice.',
    readTerms: 'Read the terms',
    readPrivacy: 'Read the privacy notice',
    forgotPassword: 'Forgot your password?',
    mfaCode: 'Authentication code',
    mfaHint: 'Staff accounts need a second step. Enter the 6-digit code from your app.',
    activeSessions: 'Where you are signed in',
    signOutAll: 'Sign out of all devices',
    revokeSession: 'Sign out this device',
    lastActive: 'Last active {when}',
  },

  family: {
    myChildren: 'My children',
    addChild: 'Add a child',
    addChildIntro: 'Tell us about your child so we can match the right teacher.',
    childName: 'Child’s name',
    childDob: 'Date of birth',
    level: 'Class or level',
    subjects: 'Subjects',
    preferredLanguage: 'Language of lessons',
    preferredLanguageHint: 'The language this student is taught in.',
    switchChild: 'Switch child',
    noChildrenTitle: 'No children linked yet',
    noChildrenBody:
      'ClassConnect staff create student accounts and link them to you. Contact support with your child’s name and class, and they will appear here.',
    grantSignIn: 'Give this child their own sign-in',
    revokeSignIn: 'Remove their sign-in',
    inviteGuardian: 'Invite another parent or guardian',
    accessFull: 'Can manage and pay',
    accessViewOnly: 'Can view only',
    archiveChild: 'Archive this profile',
    archiveBlocked:
      'This profile cannot be removed while a subscription, balance or dispute is open. You can archive it instead.',
    turns18Title: '{name} turns 18 soon',
    turns18Body:
      'When {name} turns 18 they can hold their own account. You can transfer it at any time.',
  },

  teacher: {
    myAccount: 'My teaching account',
    detailsManagedByAdmin:
      'These details were recorded by ClassConnect staff. Contact support if anything is wrong.',
    application: 'Teaching application',
    applicationIntro:
      'We check every teacher before their first lesson. This protects learners and it protects you.',
    qualification: 'Highest qualification',
    institution: 'Where you studied',
    year: 'Year completed',
    experience: 'Years of teaching experience',
    subjectsTaught: 'Subjects and levels you teach',
    teachingLanguages: 'Languages you teach in',
    teachingLanguagesHint:
      'Choose every language you can teach in. Families filter teachers by this.',
    identityDocument: 'Identity document',
    documents: 'Supporting documents',
    documentsHint: 'Certificates, diplomas, ID or teaching authorisation. PDF, JPG, PNG or HEIC, up to 10 MB each.',
    chooseFile: 'Choose a file',
    documentExpiry: 'Expiry date',
    uploading: 'Uploading… {percent}%',
    documentPendingScan: 'We are checking this file for safety. It cannot be opened yet.',
    documentQuarantined: 'This file did not pass the safety check and was removed.',
    documentType: {
      national_id: 'National ID card',
      passport: 'Passport',
      degree_certificate: 'Degree certificate',
      diploma: 'Diploma',
      teaching_authorisation: 'Teaching authorisation',
      other: 'Other document',
    },
    payoutDetails: 'Where we send your earnings',
    payoutHint: 'Only our finance team can see this. Learners and parents never see it.',
    submitApplication: 'Submit application',
    statusDraft: 'Draft',
    statusSubmitted: 'Submitted',
    statusUnderReview: 'Under review',
    statusApproved: 'Approved',
    statusRejected: 'Not approved',
    statusMoreInfo: 'More information needed',
    statusDraftHint: 'Finish and submit your application when you are ready.',
    statusSubmittedHint: 'We have your application. We usually respond within a few working days.',
    statusUnderReviewHint: 'An administrator is checking your documents now.',
    statusApprovedHint: 'You are verified. You can be assigned learners.',
    statusMoreInfoHint: 'We need something more before we can finish. See the note below.',
    codeOfConduct: 'Code of conduct',
    safeguardingPolicy: 'Safeguarding policy',
    commercialTerms: 'Commercial terms',
    acceptBeforeFirstAssignment:
      'Please accept these before your first assignment.',
  },

  admin: {
    verificationQueue: 'Teacher verification',
    queueEmpty: 'No applications waiting. New submissions appear here.',
    applicant: 'Applicant',
    submitted: 'Submitted',
    waiting: 'Waiting {days} days',
    checklist: 'Verification checklist',
    checklistHint:
      'Confirm each item yourself. Every item records who checked it and when.',
    checkIdentity: 'Identity document matches the applicant',
    checkQualification: 'Qualification certificate is genuine and legible',
    checkInstitution: 'Awarding institution is recognised',
    checkSubjects: 'Subjects and levels match the qualification',
    checkAuthorisation: 'Teaching authorisation, where required, is present and valid',
    checkPayout: 'Payout wallet name matches the applicant’s identity',
    findings: 'What you found',
    approve: 'Approve',
    reject: 'Reject',
    requestMoreInfo: 'Request more information',
    decisionReason: 'Reason (sent to the applicant)',
    approveBlocked: 'Confirm every checklist item before approving.',
    // Admin-created accounts
    students: 'Students',
    teachers: 'Teachers',
    newStudent: 'Add a student',
    newTeacher: 'Add a teacher',
    createStudent: 'Create student account',
    createTeacher: 'Create teacher account',
    newStudentIntro:
      'Only an administrator can create a student account. Choose the school, the class, and the subjects they will learn.',
    newTeacherIntro:
      'Only an administrator can create a teacher account. Choose the school and the subjects they will teach, and confirm their credentials below.',
    schoolType: 'Which school?',
    schoolPrimary: 'Primary school',
    schoolPrimaryHint: 'Class 1 to Class 6.',
    schoolSecondary: 'Secondary school',
    schoolSecondaryHint: 'Form 1 to Form 5, Lower Sixth and Upper Sixth.',
    allSchools: 'All',
    chooseClass: 'Choose the class',
    chooseSubjects: 'Subjects this student will learn',
    chooseSubjectsHint: 'Only subjects taught in the chosen class are listed.',
    chooseTeachingSubjects: 'Subjects this teacher will teach',
    chooseTeachingSubjectsHint:
      'Pick a class, then the subjects. Repeat for each class they teach.',
    subjectsSelected: '{count} selected',
    guardianPhone: 'Parent’s phone number',
    guardianPhoneHint:
      'Links this student to a parent who already has an account. Leave empty to link one later.',
    giveOwnSignIn: 'Give this student their own sign-in',
    giveOwnSignInHint: 'You can add or remove this at any time.',
    teacherPhoneHint: 'They sign in with this number.',
    teacherPasswordHint: 'Give this to the teacher. They can change it after signing in.',
    payoutWallet: 'Mobile money number for earnings',
    willBeApproved: 'Every required check is confirmed. This teacher will be approved and can be assigned learners.',
    willBeUnderReview:
      'Some checks are not confirmed. The account will be created, but the teacher cannot be listed, assigned or paid until they are.',
    noStudentsTitle: 'No students yet',
    noStudentsBody: 'Add a student to choose their class and subjects.',
    guardianIs: 'Parent: {name}',
    noGuardian: 'No parent linked',
    hasOwnSignIn: 'has own sign-in',
    suspend: 'Suspend teacher',
    suspendWarning:
      'Suspending cancels their future sessions, notifies affected learners and parents, and freezes payouts.',
    auditTrail: 'Audit trail',
  },

  catalogue: {
    levels: 'Levels',
    subjects: 'Subjects',
    findTeacher: 'Find a teacher',
    verified: 'Verified',
    yearsExperience: '{count} years’ experience',
    lessonsDelivered: '{count} lessons delivered',
    ratingHidden: 'New teacher',
    ratingHiddenHint: 'We show a rating once a teacher has at least {count} reviews.',
    noTeachersTitle: 'No teachers match yet',
    noTeachersBody: 'Try removing a filter, or check back soon. We verify new teachers every week.',
  },

  errors: {
    generic: 'Something went wrong on our side. Please try again.',
    network: 'We could not reach ClassConnect. Check your connection and try again.',
    timeout: 'That is taking longer than expected. Check your connection and try again.',
    unauthorised: 'Please sign in to continue.',
    forbidden: 'You do not have access to this.',
    notFound: 'We could not find that.',
    validation: 'Please check the highlighted fields.',
    phone: {
      invalid: 'That does not look like a valid phone number. Example: 6XX XXX XXX.',
      not_mobile: 'Please use a mobile number. We need to send you an SMS.',
      taken: 'That number already has an account. Try signing in instead.',
    },
    email: { taken: 'That email already has an account. Try signing in instead.' },
    password: {
      too_short: 'Please use at least 10 characters. A short sentence works well.',
      too_long: 'That password is too long.',
      required_for_email: 'Please choose a password to sign in with your email.',
      required_for_signin: 'Set a password to give this student their own sign-in.',
      incorrect: 'That email and password do not match.',
    },
    identifier: { required: 'Please give us a phone number or an email address.' },
    language: { required: 'Choose at least one language.' },
    terms: { required: 'Please accept the terms before continuing.' },
    dob: {
      required: 'Please give your date of birth.',
      adult_required: 'You must be 18 or older to hold your own account. A parent can create yours.',
      future: 'That date is in the future.',
    },
    otp: {
      format: 'Please enter the 6 digits we sent you.',
      incorrect: 'That code is not right. You have {remaining} tries left.',
      expired: 'That code has expired. Ask for a new one.',
      too_many: 'Too many tries. Ask for a new code.',
      rate_limited: 'You have asked for several codes. Please wait {minutes} minutes and try again.',
      daily_limit: 'You have reached today’s limit for codes. Please try again tomorrow, or contact support.',
    },
    account: {
      locked: 'Your account is locked for {minutes} minutes after too many attempts. We have told the account holder.',
      suspended: 'This account is suspended. Please contact support.',
    },
    mfa: {
      required: 'Enter your authentication code.',
      incorrect: 'That authentication code is not right.',
      not_started: 'Set up your authenticator app first.',
    },
    teacher: {
      subjects_required: 'Choose at least one subject and level.',
      not_approved: 'Only approved teachers can be assigned learners.',
      already_applied: 'You already have an application in progress.',
      application_closed: 'This application is closed.',
    },
    student: {
      subjects_required: 'Choose at least one subject for this student.',
    },
    level: {
      not_found: 'Please choose a class.',
      wrong_school_type: 'That class does not belong to the school you chose.',
    },
    subject: {
      not_at_level: '{count} of the subjects you chose are not taught at that class.',
    },
    verification: {
      reason_required: 'Please give a reason. We send it to the applicant.',
      already_decided: 'This application has already been decided.',
      checklist_incomplete: 'Confirm every checklist item before approving. Still to confirm: {missing}.',
    },
    learner: {
      archive_blocked: 'This profile has an active subscription, balance or dispute. Archive it instead.',
      not_yours: 'You can only manage children linked to your account.',
      credentials_exist: 'This child already has their own sign-in.',
    },
    guardian: {
      invitee_not_found:
        'That person does not have a ClassConnect account yet. Ask them to sign up first, then invite them.',
      not_a_parent: 'That account is not a parent account.',
    },
    impersonation: {
      read_only: 'You are viewing as another user. This view is read-only.',
    },
    file: {
      no_extension: 'That file has no file type. Please rename it, for example to ".pdf".',
      empty: 'That file is empty. Please choose another one.',
      too_large: 'That file is larger than {maxMb} MB. Please use a smaller file.',
      type_blocked: 'We cannot accept ".{extension}" files for safety reasons.',
      type_not_allowed: 'Please use one of these file types: {allowed}.',
      upload_not_found: 'We did not receive that file. Please try uploading it again.',
      rejected: 'We could not accept that file. Please try uploading it again.',
      quarantined:
        'That file did not pass our safety check and has been removed. Please scan your device and try a different file.',
      not_available:
        'That file is not ready to view yet. We check every file for safety before it can be opened.',
    },
  },

  notifications: {
    otp: { body: 'Your ClassConnect code is {code}. It expires in {minutes} minutes. Do not share it.' },
    welcome: { subject: 'Welcome to ClassConnect', body: 'Hello {name}, your ClassConnect account is ready.' },
    teacherApplicationSubmitted: {
      subject: 'We received your application',
      body: 'Hello {name}, we have your teaching application and will review it shortly.',
    },
    teacherApproved: {
      subject: 'You are verified',
      body: 'Hello {name}, your application is approved. You can now be assigned learners.',
    },
    teacherRejected: {
      subject: 'About your application',
      body: 'Hello {name}, we could not approve your application. Reason: {reason}. You may apply again.',
    },
    teacherMoreInfo: {
      subject: 'We need a little more',
      body: 'Hello {name}, we need more information before we can finish: {reason}.',
    },
    teacherSuspended: {
      subject: 'Your account is suspended',
      body: 'Hello {name}, your teaching account is suspended pending review. Reason: {reason}.',
    },
    accountLocked: {
      subject: 'Sign-in attempts on your account',
      body: 'We locked your account for {minutes} minutes after several failed sign-in attempts. If this was not you, please contact support.',
    },
  },
} as const;

/**
 * Widens the literal types produced by `as const` so a catalogue must match the
 * English *shape* — every key, nested exactly the same — without being forced to
 * repeat the English *text*. A missing or misspelled French key is a compile
 * error; a French translation is not.
 *
 * This is what makes acceptance criterion 8 in §9.2 ("no untranslated string in
 * any user-facing surface") checkable by the build rather than by inspection.
 */
type Widen<T> = T extends string
  ? string
  : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;
