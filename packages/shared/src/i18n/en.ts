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
    delete: 'Remove',
    actions: 'Actions',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    /** For a form that is submitted somewhere, not stored — an application. */
    sending: 'Sending…',
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
    /* The way back to your own surface from a public page. */
    myDashboard: 'My dashboard',
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
    home: {
      title: 'Welcome, {name}',
      description: 'Your teaching at a glance.',
      classes: 'Classes you teach',
      learners: 'Students you teach',
      viewClasses: 'View classes',
      /* FR-HWK-008: the one figure here that is a job rather than a summary. */
      awaitingMarking: 'Waiting to be marked',
      goMark: 'Go and mark it',
    },
    /**
     * The progress bar.
     *
     * Measured against the confirmed timetable — hours taught over hours agreed —
     * because that is a figure a teacher can check. See
     * `teacher-progress.service.ts` for why that measure rather than an invented
     * score.
     */
    progress: {
      title: 'Your week',
      hours: '{taught} of {timetabled} hours',
      percent: '{percent}% of your timetabled week',
      extra: 'Plus {hours} hours taught outside your timetable.',
      /*
       * No confirmed hours means no denominator. A 0% bar would read as "you have
       * taught none of your week" rather than "your week is not agreed yet", which
       * is the real state and the one with something to do about it.
       */
      noTimetable: 'You have no confirmed hours this week. Offer some from your timetable.',
      awaitingConfirmation:
        '{count} hours are waiting for an admin to confirm. Your week starts counting once they do.',
      rating: 'Rated {average} out of 5 by {count} students.',
      ratingPending:
        '{count} of {needed} ratings so far. We show an average once there are enough for it to mean something.',
    },
    /**
     * The waiting room, before an Admin has approved the application.
     *
     * Each status says where the application actually stands, because "pending"
     * covers four situations a teacher would act on differently — one needs
     * them to finish the form, one needs them to do nothing, and one needs them
     * to correct something and send it back.
     */
    profile: {
      description: 'What we hold about you, and what an Admin verified.',
      account: 'Your account',
      teaching: 'Your teaching record',
      verified: 'Verified',
      unverified: 'Not verified yet',
      changeHint: 'To change any of this, open',
    },
    /** FR-ERN-006: the teacher's own view of what they have earned. */
    earnings: {
      description: 'What you have earned, by month.',
      net: 'Net payable',
      gross: 'Gross',
      deductions: 'Deductions',
      awaiting: 'Awaiting payout',
      taught: 'Time taught',
      period: 'Month',
      state: 'State',
      paid: 'In a payout',
      pending: 'Not yet paid',
      /*
       * The brief's daily/weekly/monthly figures, and they are a different kind of
       * number from the tiles above — teaching done, valued at the admin's rate,
       * before Finance has run a period. Called indicative because it is.
       */
      accrualTitle: 'Teaching so far — indicative',
      rate: 'At {rate} XAF an hour, set by the admin',
      accrualHint:
        'Lessons you have taught inside a confirmed timetable slot, valued at the current rate. A lesson under {minutes} minutes does not count. What you are actually paid is worked out at the end of the month, from the figures above.',
      window: { today: 'Today', thisWeek: 'This week', thisMonth: 'This month' },
      belowFloor:
        '{count} lesson(s) this month were under {minutes} minutes, so they are not counted here.',
      emptyTitle: 'Nothing earned yet',
      emptyBody:
        'Once you have taught sessions, what you earn from them appears here each month.',
      /* FR-ERN-010: says what "in a payout" does and does not mean. */
      footnote:
        '“In a payout” means the amount has been approved for payment, not that it has arrived. Payments go to the mobile money number on your profile once Finance has confirmed it.',
    },
    locked: {
      title: 'Finish your verification',
      description: 'Your teaching tools open once we have checked who you are.',
      action: 'Go to verification',
      status: {
        draft:
          'Your application is not finished yet. Add your details and documents, then send it for approval.',
        submitted:
          'Your application is with our team. We will let you know as soon as it has been checked — you do not need to do anything.',
        under_review:
          'Someone is going through your application now. We will let you know as soon as there is a decision.',
        more_info_required:
          'We need something more before we can approve you. Open your verification to see what is missing.',
        rejected:
          'Your application was not approved. Open your verification to see the reason.',
        approved: 'You are approved.',
      },
    },
    classes: {
      title: 'Classes',
      description: 'Choose a group to see the classes you teach in it.',
      bandEmpty: 'You do not teach any classes in this group yet.',
      learnerCount: '{count} students',
      band: {
        primary: 'Primary (Class One to Class Six)',
        secondary: 'Secondary (Form One to Form Five)',
        sixth_form: 'Lower and Upper Sixth',
        private: 'Private classes',
      },
      column: {
        name: 'Class',
        level: 'Level',
        subject: 'Subject',
        students: 'Students',
      },
    },
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
      intro_video: 'Introduction video',
      other: 'Other document',
    },
    payoutDetails: 'Where we send your earnings',
    payoutHint: 'Only our finance team can see this. Learners and parents never see it.',
    /* We hold the number but cannot show it — see the field for why. */
    payoutOnFile:
      'We have {number} on file. It is stored encrypted, so we cannot show it in full — type it again to confirm, or enter a different number.',
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
    /**
     * The applicant's files, shown where the decision is made.
     *
     * FR-FIL-003 keeps every link short-lived, so these are fetched per file
     * when the reviewer asks for them rather than held on the page.
     */
    review: {
      documents: 'What the applicant sent',
      openDocument: 'Open',
      removeDocument: 'Remove',
      /**
       * Clearing an application out of the queue.
       *
       * Worded as "remove from the queue" rather than "delete", because that is
       * exactly what it does — the record is retained (FR-TVR-010) and the
       * database will not permit otherwise. Calling it delete would promise
       * something that does not happen.
       */
      removeFromQueue: 'Remove from queue',
      removeFromQueueConfirm: 'Remove {name} from the queue?',
      removeFromQueueHint:
        'This closes the application as not approved and takes it off this list. The record is kept, and the applicant is told the reason.',
      removeFromQueueReason: 'Reason — the applicant will see this',
      removeFromQueueAction: 'Remove it',
      removeConfirm: 'Remove “{fileName}”? This deletes the file for good.',
      removeReason: 'Why are you removing it? The applicant will be told.',
      removeConfirmAction: 'Remove it',
      watchIntro: 'The applicant’s introduction video',
      noDocuments:
        'This applicant has not uploaded any documents yet. There is nothing here to verify — ask for what you need rather than approving.',
    },
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

  /**
   * The three teaching bands.
   *
   * Top level rather than under `admin`, because a learner and a teacher see
   * these words too — on a profile, in a plan name, on a receipt.
   */
  schoolType: {
    primary: 'Primary school',
    primaryHint: 'Class 1 to Class 6.',
    secondary: 'Secondary school',
    secondaryHint: 'Form 1 to Form 5, and GCE Ordinary Level.',
    sixthForm: 'Lower & Upper Sixth',
    sixthFormHint: 'Lower Sixth and Upper Sixth, and GCE Advanced Level teaching.',
    all: 'All bands',
    unclassified: 'Not classified',
  },

  /** §4.4 extension — classifying teachers, and what they teach. */
  teachers: {
    title: 'Teachers',
    band: 'Teaches',
    classify: 'Change band',
    classified: 'Teacher reclassified',
    classifyTitle: 'Move {name} to a different band',
    classifyBody:
      'This decides which learners {name} can be assigned to. It does not change the subjects already recorded against them.',
    classifyMismatch:
      '{count} of their subjects are taught at levels outside this band. Those subjects stay on the record and will need reviewing.',
    unclassifiedBanner:
      '{count} teachers have no band. They cannot be assigned a learner until one is chosen.',
    subjectsTaught: 'Subjects taught',
    noSubjects: 'No subjects recorded',
    hoursTaught: 'Hours taught',
    hoursThisMonth: 'This month',
    hoursAllTime: 'All time',
    sessionsDelivered: 'Lessons delivered',
    learnersTaught: 'Learners taught',
    perSubject: 'By subject',
    noHours: 'No lessons delivered yet',
    verification: 'Verification',
    emptyTitle: 'No teachers in this band',
    emptyBody: 'Change the filter, or add a teacher.',
    viewDetail: 'Open',
    hoursExplain:
      'Hours come from the media server’s join and leave events, never from a teacher’s own account of them.',
  },


  /** The weekly timetable. */
  schedule: {
    title: 'Schedules',
    subtitle: 'The week ahead, by band or by private lesson.',
    private: 'Private classes',
    privateHint: 'One-to-one lessons, across every band.',
    thisWeek: 'This week',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    weekOf: 'Week of {date}',
    today: 'Today',
    emptyTitle: 'Nothing scheduled',
    emptyBody: 'No lessons are booked for this group in this week. Try another week, or another group.',
    noLessons: 'No lessons',
    totalSessions: '{count} lessons',
    totalTeachers: '{count} teachers',
    cancelled: 'Cancelled',
    liveNow: 'Live now',
    slotTeacher: 'Teacher',
    slotDetail: 'Lesson detail',
    nowTeaching: 'Teaching right now',
    nowTeachingNone: 'Not in a lesson at the moment',
    nowTeachingThis: 'This is the lesson they are in.',
    runningFor: 'Running {duration}',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
  },
  /** §4.x extension — live lessons. */
  live: {
    title: 'Live classes',
    subtitle: 'Every lesson in progress right now.',
    emptyTitle: 'No lessons in progress',
    emptyBody: 'Lessons appear here the moment a teacher starts one.',
    teacher: 'Teacher',
    subject: 'Subject',
    kind: 'Type',
    private: 'Private lesson',
    privateHint: 'One-to-one, with a single learner.',
    group: 'Group class',
    attending: 'Attending',
    attendingCount: '{count} attending',
    nobodyJoined: 'Nobody has joined yet',
    startedAt: 'Started',
    runningFor: 'Running {duration}',
    scheduledFor: 'Scheduled {duration}',
    overrunning: 'Over by {duration}',
    recording: 'Recording',
    recordingOn: 'Being recorded',
    recordingOff: 'Not recorded',
    level: 'Level',
    startingSoon: 'Starting soon',
    startsIn: 'Starts in {duration}',
    watchNote:
      'Opening this list records who looked, and when. Everyone in a lesson is told that staff may see it.',
    liveNow: '{count} live now',
    newClassStarted: '{teacher} started a {kind} — {subject}',
  },

  /**
   * The admin sidebar (§3).
   *
   * `badgeLabel` exists because §3 requires the count to be announced to screen
   * readers and never conveyed by colour alone (UI-003).
   */
  adminNav: {
    title: 'ClassConnect · Admin',
    collapse: 'Collapse the menu',
    expand: 'Expand the menu',
    unavailableTitle: 'The menu could not be loaded',
    unavailableBody:
      'This is not about your account. The admin service is unreachable or out of date. Tell whoever runs the platform, and quote the reference below.',
    group: {
      approvals: 'Approvals',
      people: 'People',
      operations: 'Operations',
      money: 'Money',
    },
    /*
     * The accessible name of a collapsible group's toggle.
     *
     * Three whole sentences rather than fragments stitched together at runtime:
     * French puts a space before its colon and does not order the clauses the
     * same way, and a translator handed "{label}, {detail}" can fix neither.
     */
    sectionBadgeLabel: '{label}, {count} items need attention',
    sectionCurrentLabel: '{label}, contains the current page',
    sectionBadgeCurrentLabel:
      '{label}, {count} items need attention, contains the current page',
    overview: 'Overview',
    students: 'Students',
    primaryStudents: 'Primary students',
    teachers: 'Teachers',
    // Distinct from the approval queues above, which are work waiting to be
    // done. These are the full rosters — everyone already on the platform.
    teacherRoster: 'All teachers',
    studentRoster: 'All students',
    live: 'Live classes',
    schedule: 'Schedules',
    support: 'Assign customer service',
    messages: 'Messages',
    safeguarding: 'Safeguarding',
    payments: 'Payments',
    studentsFees: 'Students — fees',
    studentsPaid: 'Students — paid',
    studentsOwing: 'Students — owing',
    teachersPaid: 'Teachers — paid',
    teachersPending: 'Teachers — pending',
    hoursEarnings: 'Hours & earnings',
    reconciliation: 'Reconciliation',
    accounts: 'Accounts & access',
    reports: 'Reports',
    audit: 'Audit log',
    badgeLabel: {
      studentsAwaitingApproval: 'Students awaiting approval: {count}',
      primaryAwaitingApproval: 'Primary students awaiting approval: {count}',
      teachersAwaitingVerification: 'Teachers awaiting verification: {count}',
      unassignedTickets: 'Unassigned tickets: {count}',
      safeguardingOpen: 'Safeguarding concerns open: {count}',
      studentsOwing: 'Students owing payment: {count}',
      teacherPayoutsPending: 'Teacher payouts pending: {count}',
      reconciliationUnmatched: 'Unmatched payments: {count}',
      liveClasses: 'Lessons in progress: {count}',
      teachersUnclassified: 'Teachers with no band: {count}',
    },
  },

  /** §4.1 — the overview answers "what needs me right now?". */
  overview: {
    title: 'Overview',
    needsYouNow: 'What needs you now',
    operational: 'Operations',
    money: 'Money this month',
    alerts: 'Alerts',
    noAlertsTitle: 'Nothing needs attention',
    noAlertsBody: 'Alerts about payments, teachers and ungraded work appear here.',
    tile: {
      teachersAwaitingVerification: 'Teachers awaiting verification',
      studentsAwaitingApproval: 'Students awaiting approval',
      unassignedTickets: 'Unassigned tickets',
      safeguardingOpen: 'Safeguarding open',
      paymentsPendingReconciliation: 'Payments pending reconciliation',
      autoFrozen24h: 'Accounts frozen in the last 24 hours',
    },
    metric: {
      activeLearners: 'Active learners',
      activeTeachers: 'Active teachers',
      sessionsScheduled: 'Sessions scheduled today',
      sessionsDelivered: 'Sessions delivered today',
      sessionsCancelled: 'Sessions cancelled today',
      teacherNoShowRate: 'Teacher no-show rate',
      learnerNoShowRate: 'Learner no-show rate',
      verificationThroughput: 'Approvals this week',
      supportSla: 'Support SLA met',
      grossRevenue: 'Gross revenue',
      refunds: 'Refunds',
      teacherPoolAccrued: 'Teacher pool accrued',
      payoutsMade: 'Payouts made',
      payoutsPayable: 'Payouts payable',
      unreconciled: 'Unreconciled items',
      churn: 'Churn this month',
      paymentSuccessRate: 'Payment success rate',
    },
    alert: {
      unmatchedAboveThreshold:
        '{count} payments have not matched the provider statement, worth {value}.',
      teacherBelowThreshold: '{name} has fallen below the rating or reliability threshold.',
      ungradedOverdue: '{count} submissions have been waiting more than {days} days for a mark.',
      providerDegraded: '{provider} is responding slowly or failing.',
    },
    revenueByPlan: 'Revenue by plan',
    revenueByMethod: 'Payment success by method',
  },

  /** §4.2 / §4.3 / §4.4 — the three approval queues. */
  approvals: {
    studentsTitle: 'Students awaiting approval',
    primaryTitle: 'Primary students awaiting approval',
    teachersTitle: 'Teachers awaiting verification',
    emptyStudentsTitle: 'No students waiting',
    emptyStudentsBody: 'New student accounts appear here for approval before they become active.',
    emptyPrimaryBody:
      'New primary accounts appear here. Each needs recorded guardian consent before approval.',
    primaryBanner: 'These are children under 12. Verify guardian consent before approving.',
    learner: 'Learner',
    guardian: 'Guardian',
    guardianPhone: 'Guardian phone',
    level: 'Level',
    subjects: 'Subjects',
    dob: 'Date of birth',
    minorStatus: 'Minor',
    isMinor: 'Under 18',
    isAdult: '18 or over',
    consentRecorded: 'Guardian consent',
    plan: 'Plan',
    submittedAt: 'Submitted',
    ageOfRequest: 'Waiting',
    ageDays: '{days} days',
    checks: 'Required checks',
    checkGuardianLinked: 'Guardian account is linked and verified',
    checkDobRecorded: 'Date of birth recorded and minor status derived',
    checkConsent: 'Guardian consent recorded, with a timestamp and evidence',
    checkCatalogue: 'Level and subjects match the catalogue',
    checkDuplicate: 'No existing account with this phone or email',
    checkRecordingDisclosed: 'Default recording for one-to-one lessons disclosed and acknowledged',
    checkNoSelfSignIn: 'No self-managed sign-in unless the guardian granted it',
    checkProfileLocked: 'Profile visibility limited to guardians, assigned teachers and staff',
    checkPassed: 'Passed',
    checkFailed: 'Not met',
    approve: 'Approve student',
    approved: 'Student approved',
    reject: 'Reject',
    rejected: 'Student rejected',
    requestInfo: 'Request more information',
    requestedInfo: 'More information requested',
    reason: 'Reason (sent to the guardian)',
    reasonRequired: 'Give a reason. We send it to the guardian.',
    noBulk: 'Approvals are one at a time, on purpose. There is no bulk action.',
    approveBlocked: 'This account cannot be approved until every required check passes.',
    // §4.4 — teacher queue additions
    reviewer: 'Reviewer',
    daysWaiting: 'Days waiting',
    documents: 'Documents',
    documentsCount: '{count} documents',
    openDocument: 'Open document',
    postApprovalGate: 'Before the first assignment',
    gateCodeOfConduct: 'Code of conduct accepted',
    gateSafeguarding: 'Safeguarding policy accepted',
    gateCommercial: 'Commercial terms accepted',
    gatePending: 'Not yet accepted',
    gateAccepted: 'Accepted {when}',
    suspend: 'Suspend teacher',
    suspended: 'Teacher suspended',
    suspendConsequences: 'Suspending {name} will:',
    suspendConsequence1: 'cancel {count} upcoming sessions',
    suspendConsequence2: 'notify the affected learners and their guardians',
    suspendConsequence3: 'freeze their payouts pending review',
    suspendConsequence4: 'send their learners back to the assignment queue',
  },

  /** §4.5 — routing the support queue. */
  support: {
    title: 'Assign customer service',
    unassigned: 'Unassigned',
    myQueue: 'My queue',
    agents: 'Agents',
    emptyTitle: 'Nothing waiting',
    emptyBody: 'New support requests appear here to be assigned.',
    ticket: 'Ticket',
    channel: 'Channel',
    channelInApp: 'In-app chat',
    channelWhatsapp: 'WhatsApp',
    channelEmail: 'Email',
    category: 'Category',
    categoryGeneral: 'General',
    categoryBilling: 'Billing',
    categoryTechnical: 'Technical',
    categorySafeguarding: 'Safeguarding',
    categoryPaymentDispute: 'Payment dispute',
    priority: 'Priority',
    requester: 'Requester',
    subject: 'Subject',
    age: 'Age',
    slaCountdown: 'First response due',
    slaBreached: 'Overdue by {duration}',
    slaDueIn: 'Due in {duration}',
    openTickets: 'Open',
    waitingOnUser: 'Waiting on user',
    avgFirstResponse: 'Average first response',
    presenceOnline: 'Online',
    presenceAway: 'Away',
    presenceOffline: 'Offline',
    assign: 'Assign',
    assignTo: 'Assign to',
    assignSelected: 'Assign {count} tickets',
    assigned: 'Assigned to {name}',
    reassign: 'Reassign',
    escalate: 'Escalate',
    context: 'Ticket context',
    contextSubscription: 'Subscription',
    contextFreeze: 'Account state',
    contextRecentPayments: 'Recent payments',
    contextRecentSessions: 'Recent sessions',
    contextRecentErrors: 'Recent errors',
    routedSafeguarding: 'Routed to safeguarding. Not shown in the general pool.',
    routedFinance: 'Routed to the finance queue.',
    whatsappWindowOpen: 'WhatsApp window open for {duration}. You can reply freely.',
    whatsappWindowClosed:
      'The 24-hour WhatsApp window has closed. Replies must use an approved template.',
    whatsappTemplate: 'Approved template',
  },

  /** §4.6 — the restricted safeguarding queue. */
  safeguarding: {
    title: 'Safeguarding',
    restricted: 'This queue is restricted to designated staff. Every view of it is recorded.',
    notDesignatedTitle: 'You do not have access to this queue',
    notDesignatedBody:
      'Safeguarding is limited to named staff. Ask a super admin to designate you if this is your work.',
    emptyTitle: 'No open concerns',
    emptyBody: 'Reports from lessons, message threads and profiles appear here immediately.',
    source: 'Source',
    sourceSession: 'Lesson',
    sourceMessageThread: 'Message thread',
    sourceTeacherProfile: 'Teacher profile',
    sourceRedactionFlag: 'Blocked contact details',
    sourceOther: 'Other',
    reporter: 'Reported by',
    subjectOfReport: 'About',
    evidence: 'Evidence',
    ageOfReport: 'Age',
    firstResponseDue: 'First response due',
    firstResponseTarget: 'Target: {hours} hours',
    respond: 'Record first response',
    responded: 'First response recorded',
    state: 'State',
    stateOpen: 'Open',
    stateInReview: 'In review',
    stateActioned: 'Actioned',
    stateClosed: 'Closed',
    suspendTeacherNow: 'Suspend the teacher now',
    actionTaken: 'What was done',
    close: 'Close this report',
    closed: 'Report closed',
    neverDeleted: 'Reports and evidence are kept in full. Nothing here can be deleted.',
    redactionFlags: 'Blocked contact attempts',
    redactionFlagsBody:
      '{name} tried to share contact details with a learner {count} times. The details were removed automatically.',
    redactionPhone: 'Phone number',
    redactionEmail: 'Email address',
    redactionSocial: 'Social handle',
  },

  /** §4.7 — the six money screens. */
  payments: {
    title: 'Payments',
    studentsPaidTitle: 'Students — paid',
    studentsOwingTitle: 'Students — owing',
    teachersPaidTitle: 'Teachers — paid',
    teachersPendingTitle: 'Teachers — pending salary',
    earningsTitle: 'Hours taught & earnings',
    reconciliationTitle: 'Reconciliation',

    emptyPaidTitle: 'No payments in this period',
    emptyPaidBody: 'Change the date range, or check back after the next collection.',
    emptyOwingTitle: 'Nobody is behind',
    emptyOwingBody: 'Every learner is up to date on their instalments.',
    emptyPendingTitle: 'No payouts waiting',
    emptyPendingBody: 'Teacher earnings appear here once the period has been calculated.',
    emptyReconciliationTitle: 'Everything matched',
    emptyReconciliationBody: 'Nothing is unmatched against the provider statements.',

    learner: 'Learner',
    payer: 'Payer',
    plan: 'Plan',
    billingPeriod: 'Period',
    method: 'Method',
    methodMtnMomo: 'MTN MoMo',
    methodOrangeMoney: 'Orange Money',
    methodVisa: 'Visa',
    methodMastercard: 'Mastercard',
    amountPaid: 'Amount paid',
    paymentDate: 'Paid on',
    providerRef: 'Provider reference',
    invoiceNumber: 'Invoice',
    planTypeFull: 'Paid in full',
    planTypeInstalments: '3 instalments',
    instalmentsDone: '{done} of {total}',
    viewInvoice: 'View invoice',
    resendReceipt: 'Resend receipt',
    receiptResent: 'Receipt sent',
    refund: 'Refund',
    refunded: 'Refund started',
    refundReason: 'Why are you refunding?',
    refundConfirm:
      'Refunding {amount} to {payer} reverses the ledger entries and notifies them. It cannot be undone here.',
    financeOnly: 'Only a Finance Admin can do this.',

    totalFee: 'Total fee',
    paidToDate: 'Paid to date',
    outstanding: 'Outstanding',
    daysOverdue: 'Days overdue',
    accountState: 'Account',
    stateActive: 'Active',
    stateGrace: 'In grace',
    stateFrozen: 'Frozen',
    stateSuspended: 'Suspended',
    lastAttempt: 'Last attempt',
    lastAttemptFailed: 'Failed: {reason}',
    lastReminder: 'Last reminder',
    neverReminded: 'None sent',
    instalmentSchedule: 'Instalment schedule',
    instalmentNumber: 'Instalment {number}',
    instalmentScheduled: 'Scheduled',
    instalmentDue: 'Due',
    instalmentOverdue: 'Overdue',
    instalmentPaid: 'Paid',
    instalmentCancelled: 'Cleared',
    dueOn: 'Due {date}',
    sendReminder: 'Send a reminder now',
    reminderSent: 'Reminder sent',
    reminderChannel: 'Send by',
    paymentHistory: 'Payment history',
    setStage: 'Set status',
    setStageTitle: 'Set fee status',
    current: 'Current',
    reasonHint: 'Why this is being changed — a correction, a waiver, fees recorded elsewhere',
    stageAdjusted: 'Fee status set to {stage}.',
    /* UI-007: the consequence, before the button. */
    stageConsequence:
      'This changes the status without a payment. It writes a balanced ledger entry against the learner’s balance and is recorded with your name and reason. Use Record payment instead when money was actually received.',
    register: 'Register',
    registerTitle: 'Register student',
    registered: '{learner} registered. Fee status can now be set.',
    choosePlan: 'Plan',
    howToPay: 'How the fees will be paid',
    startOn: 'Fees start from',
    registerConsequence:
      'This creates the subscription and its payment schedule for {total}. Record payment and Set status become available on this row.',
    registrationFee: 'Registration fee (FCFA)',
    registrationFeeHint: 'A one-off enrolment fee, separate from tuition. Enter 0 if there is none.',
    tuitionParts: 'Tuition, split into parts',
    tuitionTotal: 'Tuition total',
    contractTotal: 'Total to pay',
    editPlan: 'Edit plan',
    editPlanTitle: 'Edit the payment plan',
    planUpdated: 'Payment plan updated for {learner}.',
    savePlan: 'Save plan',
    amount: 'Amount (FCFA)',
    partDueOn: 'Due date',
    partsSum: 'Parts add up to {sum} of {total}',
    mustMatch: 'they must match exactly',
    editPlanConsequence:
      'The tuition total is whatever the parts add up to. A part that has already been paid cannot be re-priced. The student and the payer are told when the plan changes, and the change is recorded with your name and reason.',
    feesTitle: 'Students — fees',
    feesSubtitle: 'Every registered student, and where their fees stand.',
    student: 'Student',
    level: 'Level',
    feeStage: 'Fee status',
    progress: 'Parts paid',
    noStudents: 'No students match',
    noStudentsBody: 'Try a different level or clear the search.',
    noSubscription: 'Not registered',
    stage: {
      not_registered: 'Not registered',
      registered: 'Registration only',
      first: 'First instalment',
      second: 'Second instalment',
      completed: 'Completed',
    },
    searchStudent: 'Search student, payer, phone or invoice',
    showingCount: 'Showing {shown} of {total}',
    levelGroup: {
      all: 'All levels',
      primary: 'Primary',
      secondary: 'Secondary',
      lower: 'Lower Sixth',
      upper: 'Upper Sixth',
    },
    recordPaymentTitle: 'Record a payment',
    recordPayment: 'Record payment',
    amountReceived: 'Amount received (FCFA)',
    wholeFrancsOnly: 'Whole francs only',
    paidVia: 'How it was paid',
    methodCash: 'Cash',
    methodBank: 'Bank transfer',
    evidenceRef: 'Evidence reference',
    evidenceHint: 'Receipt number, transaction ID or file reference',
    reason: 'Reason',
    /* UI-007: the consequence, before the button. */
    recordConsequence:
      'This creates a payment and ledger entries, issues a numbered invoice, and settles instalments in order starting from the earliest unpaid one. It cannot be edited afterwards — a correction is another entry.',
    recordedPartial: '{count} instalment(s) settled. Invoice {invoice}.',
    recordedComplete: 'Fees complete. Invoice {invoice}.',
    recordOfflinePayment: 'Record a payment taken offline',
    offlineAmount: 'Amount received',
    offlineReason: 'Why is this being recorded by hand?',
    offlineEvidence: 'Evidence',
    offlineRecorded: 'Payment recorded',

    teacher: 'Teacher',
    period: 'Period',
    attendedMinutes: 'Attended minutes',
    grossEarnings: 'Gross',
    deductions: 'Deductions',
    providerFee: 'Provider fee',
    taxWithheld: 'Tax withheld',
    netPaid: 'Net paid',
    netPayable: 'Net payable',
    payoutMethod: 'Paid to',
    approvedBy: 'Approved by',
    paidAt: 'Paid at',
    kycComplete: 'KYC',
    walletVerified: 'Wallet',
    daysPending: 'Days pending',
    whyThisNumber: 'Why this number?',
    sessionsBehind: 'Sessions behind this figure',
    approvePayout: 'Approve payout',
    payoutApproved: 'Payout approved',
    approveBatch: 'Approve {count} payouts',
    batchConfirmTitle: 'Confirm each payout before it is sent',
    batchTotal: 'Total to send: {amount}',
    blocked: 'Blocked',
    blockedWalletUnverified: 'The payout wallet has not been verified.',
    blockedKycIncomplete: 'KYC is not complete.',
    blockedTeacherSuspended: 'This teacher is suspended. Earnings are held, not forfeited.',
    blockedBelowMinimum: 'Below the {minimum} payout minimum.',
    blockedNothingPayable: 'Nothing is payable for this period.',
    heldPendingReview: 'Held pending review',
    heldPendingReviewBody:
      'This teacher is suspended. {amount} is held and will not be sent until someone decides to release or withhold it.',
    release: 'Release the held earnings',
    withhold: 'Withhold the earnings',
    heldDecisionReason: 'Reason for this decision',

    sessionsDelivered: 'Sessions delivered',
    oneToOne: 'One-to-one',
    group: 'Group',
    effectiveHourly: 'Effective hourly',
    poolThisMonth: 'Teacher pool this month',
    poolBasis: 'Basis: {percent}% of revenue, {basis}',
    poolBasisGross: 'on gross',
    poolBasisNet: 'net of fees and tax',
    poolUnresolved:
      'The revenue share is not commercially settled (OI-02). These values come from configuration and are recorded on each earnings row.',
    unallocated: 'Unallocated pool',
    unallocatedBody:
      '{amount} could not be attributed because those learners attended no sessions. It is held for a decision and will not be moved automatically.',
    unallocatedDecide: 'Decide what happens to this',
    unallocatedRelease: 'Share among teachers',
    unallocatedRetain: 'Keep as platform revenue',
    unallocatedCarry: 'Carry forward to next period',
    unallocatedDecided: 'Decision recorded',
    recalculate: 'Recalculate this period',
    recalculated: 'Period recalculated',
    configVersion: 'Calculated with {version}',

    provider: 'Provider',
    statementDate: 'Statement date',
    unmatchedItems: 'Unmatched items',
    matched: 'Matched',
    unmatched: 'Unmatched',
    writtenOff: 'Written off',
    escalated: 'Escalated',
    matchTo: 'Match to a payment',
    matchedOk: 'Matched',
    writeOff: 'Write off',
    writeOffReason: 'Why is this being written off?',
    writtenOffOk: 'Written off',
    escalate: 'Escalate',
    stateMachine: 'Payment states',
    stateInitiated: 'Initiated',
    statePending: 'Pending',
    stateSucceeded: 'Succeeded',
    stateFailed: 'Failed',
    statePendingReconciliation: 'Pending reconciliation',
    recheckHourly: 'Rechecked every hour. Escalates if unresolved after {hours} hours.',
    thresholdAlert:
      'Unmatched items are above the alert threshold of {count} items or {value}.',
  },

  /** §5.4 / §5.5 — freezing, in plain language. */
  freeze: {
    freeze: 'Freeze account',
    unfreeze: 'Unfreeze account',
    frozen: 'Account frozen',
    unfrozen: 'Account unfrozen',
    frozenAutomatic: 'Frozen — non-payment (automatic)',
    frozenManual: 'Frozen — manual: {reason}',
    reason: 'Reason',
    reasonRequired: 'Give a reason. It is recorded against this account.',
    category: 'Category',
    categoryNonPayment: 'Non-payment',
    categorySafeguarding: 'Safeguarding',
    categoryAbuse: 'Abuse',
    categoryDispute: 'Dispute',
    categoryOther: 'Other',
    manualOutranks:
      'A manual freeze is not lifted by payment. Only an admin can lift it.',
    confirmLearnerTitle: 'Freezing this account',
    confirmLearnerBody:
      'Freezing {name} cancels {sessions} upcoming sessions and notifies the guardian and {teachers} teachers. They can still sign in, see their balance and pay. They cannot join lessons, open materials or submit homework.',
    confirmUnfreezeBody:
      'Unfreezing {name} restores their access immediately. Bookings return where the slot is still free; otherwise they will be asked to rebook.',
    confirmTeacherBody:
      'Freezing {name} cancels {sessions} upcoming sessions, notifies the affected learners and their guardians, freezes payouts pending review, and sends {learners} learners back to the assignment queue.',
    deferredMidSession:
      'This learner is in a lesson now. The freeze is recorded and takes effect when the lesson ends.',
    autoNoticeTrail: 'Notices sent before this freeze',
    noticeBefore: '{days} days before',
    noticeDue: 'On the due date',
    noticeFreeze: 'On the freeze date',
    triggeringInstalment: 'Triggered by instalment {number}, due {date}',
    frozenSince: 'Frozen since {when}',
    liftedBy: 'Lifted by {name}',
    payToUnfreeze: 'Paying this instalment unfreezes the account immediately.',
  },

  /** §6 — accounts and access, reports, audit. */
  accounts: {
    title: 'Accounts & access',
    searchPlaceholder: 'Search by name, phone or email',
    emptyTitle: 'Search for an account',
    emptyBody: 'Type a name, phone number or email address to find someone.',
    noResultsTitle: 'Nothing matched',
    noResultsBody: 'Check the spelling, or try just the phone number.',
    name: 'Name',
    contact: 'Contact',
    roles: 'Roles',
    state: 'State',
    linkedRecords: 'Linked records',
    activeSessions: 'Signed in on {count} devices',
    grantRole: 'Grant a role',
    revokeRole: 'Revoke a role',
    roleGranted: 'Role granted',
    roleRevoked: 'Role revoked',
    superAdminOnly: 'Only a super admin can change roles.',
    forceSignOut: 'Sign out of all devices',
    signedOut: 'Signed out of all devices',
    forceSignOutConfirm:
      'This ends all {count} of their sessions immediately. They will have to sign in again.',
    designateSafeguarding: 'Designate for safeguarding',
    removeSafeguarding: 'Remove safeguarding access',
    designationChanged: 'Safeguarding access changed',
    viewAs: 'View as this user',
    viewAsReason: 'Why do you need to see their account?',
    viewAsBanner: 'You are viewing as {name}. This is read-only and is being recorded.',
    viewAsEnd: 'Stop viewing as {name}',
  },

  reports: {
    title: 'Reports',
    dateRange: 'Date range',
    from: 'From',
    to: 'To',
    filterLevel: 'Level',
    filterSubject: 'Subject',
    filterRegion: 'Region',
    all: 'All',
    exportCsv: 'Export to CSV',
    exported: 'Export started',
    emptyTitle: 'No data for these filters',
    emptyBody: 'Widen the date range, or clear a filter.',
    readReplicaNote: 'Reports read from a copy of the database, so they never slow the platform.',
  },

  audit: {
    title: 'Audit log',
    readOnly: 'This log is append-only. Entries are never changed or removed.',
    emptyTitle: 'No entries match',
    emptyBody: 'Widen the date range, or clear the actor and action filters.',
    when: 'When',
    actor: 'Who',
    action: 'What',
    entity: 'On',
    ip: 'IP address',
    before: 'Before',
    after: 'After',
    reason: 'Reason',
    filterActor: 'Who',
    filterAction: 'Action',
    filterEntity: 'Record type',
    system: 'System',
    viewDetail: 'View the full entry',
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
    timetable: {
      clash: 'That overlaps {count} hour(s) you already have. Choose a different time.',
      /* No longer names Friday: the school week is configurable, so the day
         that is out of range depends on the setting. `outside_school_week`
         below is the one that can state the actual limit. */
      day_out_of_range: 'That is not a day of the week.',
      outside_teaching_day: 'Classes run between 07:00 and 19:00.',
      reversed: 'The end time must be after the start time.',
      too_short: 'A class must be at least 30 minutes.',
      too_long: 'A single class cannot be longer than 4 hours.',
      not_your_subject: 'You are not approved to teach that subject at that level.',
      already_decided: 'That hour has already been decided.',
      note_required: 'Give a reason when refusing an hour.',
      /* Raised where a period is claimed, not merely proposed. */
      slot_taken: 'Another teacher has just taken that period. Choose a different one.',
      subject_full:
        'You already have your {max} periods of this subject in this class. Choose another subject, or another class.',
      subject_days_full:
        'You already teach this subject on {max} days this week. Add the period to one of those days, or ask an admin for permission.',
      on_hold: 'An admin has put that period on hold. Ask them to release it.',
      outside_school_week: 'Classes run on the first {days} days of the week.',
    },

    /** BUILD-PLAN Phase 3 — group exercises. */
    exercise: {
      locks_before_due: 'The lock time cannot be before the due time.',
      never_locks: 'That exercise has no lock time, so there is nothing to reopen.',
      score_above_max: 'The score cannot be more than {maxScore}.',
      locked: 'This exercise is locked. Ask your teacher to reopen it.',
    },
    group: {
      over_capacity: 'That is more learners than the group holds ({capacity}).',
      learner_not_at_level: 'One of those learners is not in this class.',
      not_this_exercise: 'That exercise was not set to this group.',
    },

    /** BUILD-PLAN Phase 4 — exams. */
    exam: {
      needs_options: 'A multiple-choice question needs at least two answers.',
      no_correct_option: 'Tick the correct answer, or nobody can score on this question.',
      single_answer_only: 'A one-answer question can only have one correct answer.',
      structural_has_options: 'A structural question has no answers to choose from.',
      closes_before_opens: 'The closing time must be after the opening time.',
      no_questions: 'Add at least one question before publishing.',
      not_your_group: 'That group is not yours.',
      answer_not_in_attempt: 'That answer does not belong to this script.',
      mark_above_question: 'That question is only worth {max} marks.',
      unmarked_remain: '{unmarked} structural answers are still unmarked.',
    },

    /** BUILD-PLAN Phase 6 — report cards. */
    report: {
      bad_year: 'Write the academic year as 2026-2027.',
      learner_not_at_level: 'One of those learners is not in this class.',
      no_marks: 'No marks have been entered for that class and term yet.',
    },

    /** BUILD-PLAN Phase 5 — live. */
    live: {
      one_audience: 'A lesson is either for a group or for one learner, not both.',
      already_live: 'You are already teaching a lesson. End it before starting another.',
      subject_mismatch: 'That group does not study that subject.',
      not_your_learner: 'You are not assigned to teach that learner.',
      slot_not_confirmed: 'That timetable slot is not yours, or has not been confirmed.',
    },

    /*
     * The server names the field that failed; these say what was wrong with it.
     *
     * `ZodValidationPipe` falls back to `errors.field.<zod code>` for any issue
     * without a message key of its own. Without these, `t()` returned the key
     * itself and the applicant read "errors.field.too_small" on the page.
     */
    field: {
      too_small: 'This is too short.',
      too_big: 'This is too long.',
      invalid_type: 'This is required.',
      invalid_string: 'Please check the format.',
      invalid_enum_value: 'Please choose one of the options.',
      invalid_union: 'Please check this value.',
      invalid_date: 'Please give a valid date.',
      not_multiple_of: 'Please check this value.',
      custom: 'Please check this value.',
    },
    /** Human names for the fields the server can reject, keyed by its path. */
    fieldName: {
      highestQualification: 'Highest qualification',
      institution: 'Institution',
      qualificationYear: 'Year qualified',
      yearsExperience: 'Years of experience',
      payoutWallet: 'Mobile money number',
      payoutMethod: 'Payout method',
      languages: 'Teaching languages',
      subjects: 'Subjects and levels',
      nationalId: 'Identity number',
      bio: 'About you',
      address: 'Address',
    },
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
      incorrect: 'Those sign-in details do not match. Check the password and try again.',
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
      noRecord:
        'Your teaching profile has not been set up yet. Ask an administrator to complete it.',
    },
    class: {
      notFound: 'We could not find that class, or it is not one you teach.',
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
    approval: {
      reason_required: 'Please give a reason. We send it to the guardian.',
      already_decided: 'This account has already been decided.',
      checks_incomplete: 'These checks have not passed yet: {missing}.',
      consent_missing:
        'Guardian consent has not been recorded. A learner cannot be approved without it.',
      guardian_unverified: 'The linked guardian account has not been verified yet.',
      duplicate_contact: 'Another account already uses that phone number or email.',
      no_bulk: 'Approvals are made one at a time.',
    },
    freeze: {
      reason_required: 'Please give a reason. It is recorded against this account.',
      already_frozen: 'This account is already frozen.',
      not_frozen: 'This account is not frozen.',
      manual_outranks:
        'This account has a manual freeze. Paying does not lift it — an admin must.',
      mid_session:
        'This learner is in a lesson. The freeze is recorded and takes effect when it ends.',
    },
    payout: {
      wallet_unverified: 'The payout wallet has not been verified.',
      kyc_incomplete: 'KYC is not complete for this teacher.',
      teacher_suspended: 'This teacher is suspended. Their earnings are held pending a decision.',
      below_minimum: 'This is below the {minimum} payout minimum.',
      nothing_payable: 'There is nothing payable for this period.',
      already_approved: 'This payout has already been approved.',
      decision_required: 'Someone has to decide to release or withhold this. Give a reason.',
    },
    refund: {
      reason_required: 'Please say why you are refunding.',
      not_refundable: 'Only a successful payment can be refunded.',
      exceeds_payment: 'A refund cannot be more than the payment it reverses.',
    },
    offlinePayment: {
      reason_required: 'Please say why this payment is being recorded by hand.',
      evidence_required: 'Please attach evidence of the payment.',
    },
    safeguarding: {
      not_designated:
        'Safeguarding is limited to designated staff. Ask a super admin if this is your work.',
      already_closed: 'This report is already closed.',
      action_required: 'Please record what was done before closing this.',
    },
    support: {
      not_your_ticket: 'That ticket is assigned to someone else.',
      agent_not_found: 'That agent does not exist or is not a support agent.',
      whatsapp_window_closed:
        'The 24-hour WhatsApp window has closed. Use an approved template instead.',
    },
    reconciliation: {
      note_required: 'Please say why this item is being written off.',
      already_resolved: 'This item has already been resolved.',
    },
    instalment: {
      already_paid: 'That instalment is already paid.',
      schedule_exists: 'This subscription already has a payment schedule.',
      does_not_sum: 'The instalments do not add up to the total fee.',
    },
    role: {
      super_admin_only: 'Only a super admin can grant or revoke roles.',
      cannot_remove_last_super_admin: 'There has to be at least one super admin.',
    },
    schedule: {
      tuition_required: 'Tuition must be more than zero.',
      whole_francs: 'Amounts must be whole francs.',
      must_sum_to_total: 'The parts add up to {given}, but the total is {total}.',
      unknown_part: 'That part is not in this plan.',
      part_already_paid: 'Part {number} has already been paid and cannot be re-priced.',
    },
    subscription: {
      /*
       * Registration errors.
       *
       * `no_payer` is the one an operator will actually hit, so it says what to
       * do rather than what went wrong: a subscription is a debt, and a debt
       * needs somebody to ask.
       */
      no_payer:
        'This student has no guardian linked and no account of their own, so there is nobody to bill. Link a guardian first, or convert them to an adult learner.',
      already_registered: 'This student already has an active subscription.',
      plan_unavailable: 'That plan is not available. Choose another.',
      bad_start_date: 'That start date is not valid.',
    },
    adjustment: {
      reason_required: 'Give a reason — it is recorded with your name.',
    },
    file: {
      no_extension: 'That file has no file type. Please rename it, for example to ".pdf".',
      empty: 'That file is empty. Please choose another one.',
      too_large: 'That file is larger than {maxMb} MB. Please use a smaller file.',
      type_blocked: 'We cannot accept ".{extension}" files for safety reasons.',
      type_not_allowed: 'Please use one of these file types: {allowed}.',
      upload_rejected: 'Storage would not accept that file. Please try again.',
      /*
       * Says the fault is ours, because it is. The previous message for this
       * case blamed the file, and an applicant with a perfectly good document
       * has no way to act on that — so they change the file, which cannot help.
       */
      storage_unavailable:
        'We could not reach our file storage just now. Your details are saved — please try the upload again in a moment.',
      already_uploaded: 'That file has already been sent.',
      no_teacher_profile:
        'Your teaching account is not set up yet. Sign out, sign in again, and open the teaching page before uploading.',
      could_not_record:
        'We could not record that file. The reference is in the server log — tell whoever runs the platform.',
      upload_not_found: 'We did not receive that file. Please try uploading it again.',
      rejected: 'We could not accept that file. Please try uploading it again.',
      quarantined:
        'That file did not pass our safety check and has been removed. Please scan your device and try a different file.',
      not_available:
        'That file is not ready to view yet. We check every file for safety before it can be opened.',
    },
  },

  notifications: {
    fees: {
      registered: {
        subject: 'School fees set up',
        body: 'Fees for {learner} have been set up. The payment plan is below.',
      },
      status_changed: {
        subject: 'Fee status updated',
        body: 'The fee status for {learner} is now {stage}.',
      },
      plan_changed: {
        subject: 'Payment plan changed',
        body: 'The payment plan for {learner} has been updated. The new dates and amounts are on the Fees page.',
      },
      payment_received: {
        subject: 'Payment received',
        body: 'A payment of {amount} was recorded for {learner}. Thank you.',
      },
    },
    otp: { body: 'Your ClassConnect code is {code}. It expires in {minutes} minutes. Do not share it.' },
    welcome: { subject: 'Welcome to ClassConnect', body: 'Hello {name}, your ClassConnect account is ready.' },
    teacherApplicationSubmitted: {
      subject: 'We received your application',
      body: 'Hello {name}, we have your teaching application and will review it shortly.',
    },
    /**
     * To staff, not to the applicant.
     *
     * Names the applicant: a queue notice reading "a teacher applied" tells
     * whoever is on duty nothing they can act on, and two of them arriving
     * together are indistinguishable.
     */
    teacherVerificationPending: {
      subject: 'A teacher is waiting for verification',
      /* `>` not `→`: this body goes out over SMS, and the arrow is outside
         GSM-7 — one character would push the whole message into UCS-2 and
         halve what fits in a segment. */
      body: '{applicant} has sent a teaching application for review. Open Approvals > Teachers to check it.',
    },
    /* Named and explained: a file that simply vanishes gets re-sent unchanged. */
    teacherDocumentRemoved: {
      subject: 'A document was removed from your application',
      body: 'Hello {name}, we removed "{fileName}" from your application. Reason: {reason}. Please upload the right file when you can.',
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

    // §4.2 — approval outcomes. The reason the admin gave travels with them.
    studentApproved: {
      subject: '{learner} is approved',
      body: 'Hello {name}, {learner}’s account is approved. You can book lessons now.',
    },
    studentRejected: {
      subject: 'About {learner}’s account',
      body: 'Hello {name}, we could not approve {learner}’s account. Reason: {reason}. Reply to this message and we will help.',
    },
    studentMoreInfo: {
      subject: 'We need a little more about {learner}',
      body: 'Hello {name}, we need more information before we can approve {learner}: {reason}.',
    },

    // FR-PAY-019 / §5.3 — the five notices that must precede any freeze.
    instalmentDueSoon: {
      subject: 'Payment due in {days} days for {learner}',
      body: 'Hello {name}, instalment {instalment} of {amount} FCFA for {learner} is due on {dueOn}. Pay in the app to keep lessons running.',
    },
    instalmentDueToday: {
      subject: 'Payment due today for {learner}',
      body: 'Hello {name}, instalment {instalment} of {amount} FCFA for {learner} is due today. Pay in the app to keep lessons running.',
    },
    instalmentFreezeWarning: {
      subject: 'Last day to pay for {learner}',
      body: 'Hello {name}, instalment {instalment} of {amount} FCFA for {learner} was due on {dueOn}. If it is not paid today, lessons pause until it is. You can pay in the app in one tap.',
    },
    accountFrozen: {
      subject: 'Lessons paused for {learner}',
      body: 'Hello {name}, lessons for {learner} are paused because instalment {instalment} of {amount} FCFA has not been paid. You can still sign in, see the timetable and pay. Paying starts lessons again straight away.',
    },
    accountUnfrozen: {
      subject: 'Lessons are back on for {learner}',
      body: 'Hello {name}, thank you. {learner}’s lessons are running again.',
    },
    sessionsCancelledAccountFrozen: {
      subject: 'Some lessons were cancelled',
      body: 'Hello {name}, {count} of your upcoming lessons were cancelled because the learner’s account is on hold. We will let you know when it is back on.',
    },
    rebookNeeded: {
      subject: 'Please rebook {count} lessons',
      body: 'Hello {name}, your account is active again. {count} of your old lesson times have been taken, so please pick new ones in the app.',
    },
    teacherSuspendedSessionsCancelled: {
      subject: 'A change to your upcoming lessons',
      body: 'Hello {name}, {count} of your upcoming lessons are cancelled while we review a staffing matter. We are arranging another teacher and will confirm the new times shortly.',
    },

    // §4.7.1 — receipts and refunds.
    paymentReceipt: {
      subject: 'Your receipt {invoice}',
      body: 'Hello {name}, here is your receipt for {amount} FCFA. Invoice number {invoice}.',
    },
    refundIssued: {
      subject: 'We have refunded {amount} FCFA',
      body: 'Hello {name}, we have refunded {amount} FCFA for {learner}. It can take a few days to reach your account.',
    },

    // §4.5 — routing.
    ticketAssigned: {
      subject: '{count} tickets assigned to you',
      body: 'Hello {name}, {count} support tickets have been assigned to you.',
    },
  },

  /**
   * The learner surface (§5 of the student brief).
   *
   * NFR-USA-002 bites hardest here: a six-year-old on a shared family phone is
   * inside this vocabulary. No "entitlement", no "submission", no "assessment"
   * — "classes", "work", "practice". Where a word had to be precise, it is short.
   */
  adminMessages: {
    title: 'Messages',
    subtitle: 'Conversations students have started with ClassConnect help.',
    search: 'Search by student or message',
    none: 'No messages yet',
    noneBody: 'When a student writes to ClassConnect help, the conversation appears here.',
    selectThread: 'Choose a conversation to read and reply.',
    new: 'Needs a reply',
    awaiting: '{count} waiting for a reply',
    reply: 'Write a reply',
    sending: 'Sending…',
    send: 'Send reply',
    scanning: 'file being checked',
    redacted: 'Contact details were removed from this message.',
    redactionNotice:
      'Phone numbers, emails and social handles are removed from replies as well. Keep everything on ClassConnect.',
  },

  teach: {
    step: {
      about: 'About you',
      aboutHelp: 'We check every teacher before their first lesson. This protects learners and it protects you.',
      video: 'Introduce yourself',
      documents: 'Your documents',
    },
      /*
       * One key was labelling two different things: the ID *number* field and
       * the document-type dropdown. Split, because "Identity document" above a
       * list containing degree certificates is simply wrong.
       */
      documentKind: 'Highest educational level',
      documentKindHint: 'Your degree, diploma or teaching authorisation.',
      identityUpload: 'ID card or passport',
      identityUploadHint: 'One photo or scan, clearly readable. This must be the same person as in your video.',
      identityReplace: 'Replace it',
      identityUploaded: 'Uploaded',
      watchYourVideo: 'Watch your video',
      videoUploaded: 'Your introduction is saved. Watch it back before you submit.',
      replaceVideo: 'Record it again',
    preview: {
      confirm: 'Looks right — upload it',
      chooseAnother: 'Choose another',
      uploading: 'Uploading…',
      scanning: 'Being checked…',
      ready: 'Ready',
      failed: 'Not sent',
      noPdfViewer: 'Your browser cannot show this PDF here. It will still upload.',
    },
    checklist: {
      title: 'Before you submit',
      idDocument: 'ID card or passport',
      /* The ID has its own box; the general picker cannot record one. */
      idDocumentWhere: 'Use the “ID card or passport” box in step 3 — not the document picker below it.',
      certificate: 'Certificate or diploma',
      help: 'You can save and come back. We only review once everything is here.',
    },
    /**
     * The state of the form, above the button rather than behind it.
     *
     * `title` lists only what the server actually refuses to accept.
     * `stillToAdd` lists the documents, which it does accept without — said
     * once the form can be sent, so it reads as the next step and not a wall.
     */
    needed: {
      title: 'Fill these in before you send:',
      ready: 'Everything we need is here. You can send this now.',
      stillToAdd:
        'You can send now and add these after — we just cannot approve you until they arrive: {items}.',
      sent: 'Sent. Your application is with our team — we will let you know when it has been checked.',
    },
    /**
     * What happens to the form after it has been sent, and after a decision.
     *
     * The reviewer's own words are the only human-written text on this page, so
     * they get a heading that says which kind of answer they are.
     */
    decision: {
      lockedTitle: 'Your application is being reviewed',
      lockedBody:
        'It is now with our team, so it cannot be changed while they read it. If they need anything more they will ask, and this form will open again.',
      rejectedTitle: 'Why this was not approved',
      moreInfoTitle: 'What we still need from you',
    },
    intro: {
      title: 'Introduce yourself on video',
      help: 'Up to 3 minutes. Tell us who you are, what you teach and how you teach it. Our team watches this before approving you — it also confirms you are the person on your ID.',
      enableCamera: 'Turn on camera',
      start: 'Start recording',
      stop: 'Stop',
      use: 'Use this recording',
      retake: 'Record again',
      orUpload: 'Or upload a video you already have',
      uploading: 'Sending your video…',
      reviewHint: 'Watch it back. Use it, or record again — as many times as you like.',
      unsupported:
        'We could not reach your camera. Check the browser permission, or upload a video instead.',
    },
  },
timetable: {
    teacherDescription: 'Choose the hours you will teach. An admin confirms them before they become class time.',
    adminTitle: 'Timetable approvals',
    adminDescription: 'Hours teachers have offered. Confirming one puts it on the class timetable.',
    nonePending: 'No hours are waiting for a decision.',
    addTitle: 'Offer an hour',
    classAndSubject: 'Class and subject',
    dayLabel: 'Day',
    from: 'From',
    to: 'To',
    propose: 'Offer this hour',
    proposed: 'Sent. An admin will confirm it.',
    withdraw: 'Withdraw',
    confirm: 'Confirm',
    reject: 'Refuse',
    free: 'Nothing timetabled',
    noSubjects: 'You have no approved subjects yet, so there is nothing to timetable.',
    confirmedHours: 'Confirmed teaching each week',
    confirmedHoursHint: 'Only confirmed hours count towards your earnings.',
    clashTitle: 'This overlaps hours you already have:',
    notePlaceholder: 'Reason — needed to refuse, and the teacher sees it',
    state: { proposed: 'Waiting for approval', confirmed: 'Confirmed', rejected: 'Refused' },
    day: { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday' },
  },

  /** BUILD-PLAN Phase 2 — lessons a teacher publishes to a class. */
  lessons: {
    teacherDescription:
      'Publish a lesson to one of your classes. Everyone in that class gets it, and can read it in the app or keep it to read offline.',
    publishTitle: 'Publish a lesson',
    listTitle: 'Lessons you have published',
    classAndSubject: 'Class and subject',
    titleLabel: 'What the class will see',
    titlePlaceholder: 'Photosynthesis — part 1',
    topicLabel: 'Topic or unit',
    chooseFile: 'The file',
    accepted: 'PDF, Word, photo, video or audio. Up to 100 MB.',
    publish: 'Publish to the class',
    uploading: 'Sending your lesson…',
    publishedOk: 'Published. Everyone in that class can open it now.',
    /*
     * The honest middle case. FR-FIL-001 keeps an unscanned file unreadable, so
     * the teacher is told the lesson is safe with us and not yet with the class —
     * rather than finding out when a child says it is missing.
     */
    pendingOk:
      'Uploaded and safe with us. It is being checked for viruses, and your class will see it as soon as that finishes.',
    none: 'You have not published any lessons yet.',
    noSubjects: 'You have no approved subjects yet, so there is no class to publish to.',
    remove: 'Remove',
    state: {
      clean: 'Published',
      pending: 'Being checked',
      awaiting_upload: 'Not sent',
      quarantined: 'Refused',
    },
  },

  /** The teacher's inbox. */
  teacherMessages: {
    description: 'Talk to ClassConnect, and to the families of the learners you teach.',
    contactAdmin: 'Message ClassConnect',
    none: 'No conversations yet.',
    pickOne: 'Choose a conversation to read it.',
    empty: 'No messages yet. Say hello.',
    placeholder: 'Write a message…',
    send: 'Send',
    closed: 'This conversation is read-only.',
    /*
     * FR-SAF-002, said on the message it happened to. A notice at the top of the
     * thread would leave the teacher assuming nothing had been altered.
     */
    redacted: 'A phone number or address was removed from this message.',
    role: {
      admin: 'ClassConnect',
      learner: 'Student',
      guardian: 'Parent',
    },
  },

  /** BUILD-PLAN Phase 3 — groups and exercises. */
  teacherGroups: {
    description:
      'Put learners into groups and set them exercises. A group locks itself at the deadline you choose.',
    createTitle: 'Create a group',
    groupName: 'Group name',
    groupNamePlaceholder: 'Form 3 Maths — Tuesday set',
    capacity: 'Maximum learners',
    create: 'Create the group',
    created: 'Group created. Add learners to it next.',
    noSubjects: 'You have no approved subjects yet, so there is no class to group.',
    none: 'You have not created any groups yet.',
    learnerCount: '{count} of {capacity} learners',
    members: 'Learners',
    pickMembers: 'Tick everyone in this group',
    noCandidates: 'Nobody at this level is taking this subject yet.',
    saveMembers: 'Save {count} learners',
    membersSaved: 'Group membership saved.',
    setExercise: 'Set an exercise',
    exerciseTitle: 'What the group will see',
    instructions: 'Instructions',
    dueAt: 'Due',
    locksAt: 'Locks at',
    /*
     * The two dates do different things and the difference is the whole feature.
     * Said where they are set, not on a help page.
     */
    locksAtHint:
      'Work handed in after the due time is accepted and marked late. After the lock time nothing can be handed in at all — only you or an admin can reopen it.',
    maxScore: 'Out of',
    createExercise: 'Set the exercise',
    exerciseCreated: 'Exercise set. Your group can see it now.',
    submissions: '{count} handed in',
    lockState: {
      open: 'No deadline',
      scheduled: 'Open',
      closing_soon: 'Closing',
      locked: 'Locked',
      reopened: 'Reopened',
    },
    unlock: 'Reopen',
    unlockReason: 'Why are you reopening this exercise? The reason is recorded.',
    unlocked: 'Reopened. The group can hand in again.',
    groupScore: 'Group score',
    groupScoreIs: 'Group score {score}/{maxScore}',
    scorePrompt: 'Group score, out of {maxScore}',
    scoreOutOfRange: 'That score is not between 0 and {maxScore}.',
    scored: 'Group score saved.',
  },

  /** BUILD-PLAN Phase 4 — exams. */
  teacherExams: {
    description:
      'Set exams for your classes. Multiple-choice questions mark themselves; you mark the structural ones.',
    setExam: 'Set an exam',
    newExam: 'New exam',
    examTitle: 'Exam title',
    durationMin: 'Minutes allowed',
    question: 'Question {number}',
    questionType: 'Kind',
    marks: 'Marks',
    type: {
      single_choice: 'Multiple choice — one answer',
      multiple_response: 'Multiple choice — several answers',
      free_response: 'Structural — you mark it',
    },
    options: 'Answers',
    optionPlaceholder: 'Answer {number}',
    isCorrect: 'This answer is correct',
    addOption: 'Add another answer',
    tickCorrect: 'Tick the correct answer. Learners never see which one it is.',
    structuralHint: 'The learner writes their own answer, and you mark it after they submit.',
    addQuestion: 'Add a question',
    removeQuestion: 'Remove this question',
    saveDraft: 'Save as a draft',
    created: 'Saved as a draft. Publish it when the paper is ready.',
    /*
     * Said before the choice is made rather than after the server corrects it.
     */
    deferredNotice:
      'This paper has a structural question, so results are held back until you have marked them. A score that is missing half the paper is not a result.',
    none: 'You have not set any exams yet.',
    questionSummary: '{questions} questions · {marks} marks',
    structuralCount: '{count} to mark by hand',
    submittedCount: '{count} handed in',
    state: { draft: 'Draft', published: 'Published' },
    publish: 'Publish',
    published: 'Published. Your class can see it now.',
    mark: 'Mark',
    release: 'Release results',
    released: 'Results released to the class.',
    noAttempts: 'Nobody has handed this in yet.',
    needsMarking: '{count} to mark',
    fullyMarked: 'Fully marked',
    terminated: 'Stopped early — read it',
    openScript: 'Open script',
    marking: 'Marking {name}',
    worth: 'Worth {marks} marks',
    awarded: 'Marks given',
    noAnswer: 'No answer',
    correctMark: '✓',
    wrongMark: '✗',
    saveMarks: 'Save marks',
    saveAndRelease: 'Save and release to this learner',
    marked: 'Marks saved.',
  },

  /** BUILD-PLAN Phase 6 — report sheets. */
  teacherReports: {
    description:
      'Enter your subject’s termly marks. Report cards are generated once every subject is in.',
    term: 'Term',
    termName: { term_1: 'First term', term_2: 'Second term', term_3: 'Third term' },
    academicYear: 'Academic year',
    coefficient: 'Coefficient',
    /* The Cameroonian weighting, explained where it is chosen. */
    coefficientHint:
      'The coefficient weights this subject in the average. Maths at 4 counts four times a subject at 1.',
    readinessTitle: 'Marks across this class',
    readinessSummary: '{done} of {total} subjects entered, for {learners} learners.',
    generationIsStaff:
      'Report cards are generated by an administrator once every subject is in, so that the average and the class position are right first time.',
    noLearners: 'Nobody at this level is taking this subject yet.',
    markOutOf: 'Marks out of {max}. Leave a box empty if you have not marked that learner yet.',
    classAverage: 'Class average so far: {average}',
    learner: 'Learner',
    mark: 'Mark',
    status: 'Saved',
    savedAlready: 'Saved',
    notYet: '—',
    submit: 'Submit these marks',
    saved: '{count} marks saved.',
  },

  /** BUILD-PLAN Phase 5 — live. */
  teacherLive: {
    description: 'Start a lesson from your timetable, and decide who may speak in it.',
    /*
     * The missing media server, stated once and plainly. A teacher who reads this
     * knows why there is no picture; one who does not would blame their webcam.
     */
    noMediaTitle: 'Video and audio are not connected yet',
    noMediaBody:
      'Everything on this screen is real — the room, the register, the raised hands and the permissions. The video and audio themselves need a media server, which is not set up yet. Attendance minutes come from that server too, so they read zero until it is.',
    liveNow: 'Live now',
    elapsed: 'Running for {minutes} minutes',
    end: 'End the lesson',
    endedEligible: 'Lesson ended after {minutes} minutes. It counts towards your earnings.',
    endedIneligible:
      'Lesson ended after {minutes} minutes. It does not count towards your earnings — it was too short, or outside your confirmed timetable.',
    earningsFloor: 'Earnings',
    pastFloor: 'Past the {minutes}-minute mark',
    beforeFloor: 'Under {minutes} minutes',
    timetableSlot: 'Timetable',
    insideSlot: 'Inside a confirmed slot',
    outsideSlot: 'Outside your timetable',
    recording: 'Recording',
    attendedRecorded: 'Attendance recorded by the media server: {minutes} minutes.',
    roster: 'Who is here ({present} present)',
    noRoster: 'This lesson has no group, so there is no register.',
    present: 'Here',
    absent: 'Not here',
    letSpeak: 'Let them speak',
    speaking: 'Speaking',
    hands: 'Hands up ({count})',
    noHands: 'Nobody is asking to speak.',
    grant: 'Let them speak',
    dismiss: 'Not now',
    speakers: 'Who can speak',
    revoke: 'Mute',
    fromTimetable: 'Start from your timetable',
    fromTimetableHint:
      'Only lessons taught inside a confirmed slot count towards your earnings, at {rate} FCFA an hour.',
    nothingToday: 'You have no confirmed lessons timetabled for today.',
    goLive: 'Go live',
    goLiveAnyway: 'Go live anyway',
    startsIn: 'Starts in {minutes} min',
    slotNeedsGroup: 'No group assigned to this slot yet',
    adHocTitle: 'Start a lesson outside your timetable',
    adHocHint:
      'You can teach at any time. A lesson outside a confirmed slot is recorded and delivered exactly the same way, but it does not accrue earnings.',
    noGroups: 'Create a group first — a live lesson needs learners.',
    started: 'You are live.',
    group: 'Group',
  },

  /** My live classes. */
  teacherRecordings: {
    description: 'Watch back the lessons you have taught, day by day.',
    none: 'You have not taught any lessons yet.',
    type: { one_to_one: 'One to one', group: 'Group class' },
    attended: '{minutes} minutes attended',
    length: '{minutes} min',
    watch: 'Watch',
    audioOnly: 'Listen — audio only, much smaller',
    availableUntil: 'Available until {date}',
    /* Four different reasons there is no video, and which one it is. */
    state: {
      ready: 'Ready',
      processing: 'The recording is still being processed.',
      in_progress: 'This lesson is still running.',
      not_recorded: 'This lesson was not recorded.',
    },
  },

  teacherNav: {
    label: 'Teaching',
    soon: 'Soon',
    comingSoon: 'This screen is being built.',
    /*
     * "Locked" and "Soon" mean different things and must not be confused.
     * Soon is on us. Locked is waiting on the teacher's own verification, and
     * says so, because it is the one of the two they can act on.
     */
    locked: 'Locked',
    lockedHint: 'Available once your application is approved.',
    overview: 'Overview',
    verification: 'Verification',
    classes: 'Classes',
    timetable: 'Timetable',
    lessons: 'Lessons',
    groups: 'Groups',
    live: 'Go live',
    recordings: 'My live classes',
    exams: 'Exams',
    reports: 'Report sheets',
    earnings: 'Earnings',
    messages: 'Messages',
    profile: 'My profile',
    group: {
      teaching: 'Teaching',
      assessment: 'Assessment',
      account: 'Account',
    },
  },

  student: {
    /** UI-005: five destinations, plain language, each with an icon. */
    tab: {
      subjects: 'Subjects',
      home: 'Home',
      classes: 'Classes',
      work: 'Work',
      practice: 'Practice',
      progress: 'Progress',
      exams: 'Exams',
      messages: 'Messages',
    },
    navLabel: 'Main menu',
    navMore: 'More',
    navMoreLabel: 'More destinations',

    /**
     * §4: profile, language, notifications and help live behind the avatar.
     * They are not destinations — putting them in the bar would break UI-005's
     * limit for no benefit.
     */
    account: {
      open: 'Your account',
      close: 'Close the account menu',
      profile: 'Your profile',
      notifications: 'What you get told about',
      help: 'Help',
      tour: 'Show me around',
    },

    home: {
      title: 'Home',
      greeting: 'Hello {name}',
      nothingTitle: 'Nothing waiting for you',
      nothingBody: 'When you have a class or some work to do, it will show up here.',
    },

    /** §5.1 — the cards, ranked by level rather than fixed. */
    card: {
      nextSession: 'Your next class',
      homeworkDue: 'Work to hand in',
      newlyGraded: 'Newly marked',
      examCountdown: 'Your exam',
      weakestTopic: 'Worth some practice',
    },

    nextSession: {
      none: 'No class booked yet',
      noneBody: 'Your teacher or the ClassConnect team will book your next class. It will show up here.',
      with: 'with {teacher}',
      /** FR-LIV-003: the control goes live 10 minutes before the start. */
      join: 'Join the class',
      opensIn: 'You can join in {time}',
      opensAt: 'You can join from {time}',
      ended: 'This class has finished',
      deviceCheck: 'Check your camera and sound',
    },

    homework: {
      none: 'No work to hand in',
      noneBody: 'When a teacher sets you some work, you will find it here.',
      due: 'Hand in by {date}',
      late: 'Late',
      dueToday: 'Hand in today',
      dueTomorrow: 'Hand in tomorrow',
    },

    graded: {
      none: 'Nothing marked yet',
      noneBody: 'When a teacher marks your work, it will show up here.',
      score: '{score} out of {max}',
      unread: 'New',
    },

    exam: {
      /** FR-PRO-003: drawn from the learner's own target date. */
      daysLeft: '{count} days to go',
      dayLeft: '1 day to go',
      today: 'Your exam starts today',
      noDate: 'No exam date set yet',
      noDateBody: 'Once your exam date is set, you will see how long you have left.',
    },

    /**
     * §5.5 / FR-GCE-004.
     *
     * NEEDS_HUMAN_COPY (Q2). This is structurally correct and deliberately
     * hedged, but it is the single sentence most likely to be quoted back at
     * the platform by an angry parent in August, and a human who will stand
     * behind it publicly has to own the words before release.
     */
    readiness: {
      title: 'How your practice is going',
      estimateOnly:
        'This is a guide to how your practice is going. It is not a prediction of your exam result.',
      explain: 'What this is based on',
      weakestTopic: 'You have found {topic} hardest so far.',
      weakestTopicAction: 'Practise this topic',
    },

    /** NFR-BAN-002: say what it will cost before it costs it. */
    data: {
      estimate: 'Uses about {size} of data',
      audioOnly: 'Audio only — uses much less data',
    },

    /* ---------------------------------------------------------------- *
     * Subjects
     * ---------------------------------------------------------------- */
    subjects: {
      title: 'Your subjects',
      none: 'No subjects yet',
      noneBody: 'Once your subjects are set up, they will show up here with your timetable.',
      timetable: 'Your timetable',
      thisWeek: 'This week',
      noTeacherYet: 'Teacher being arranged',
      noTeacherYetBody: 'The ClassConnect team is finding a teacher for this subject.',
      taughtBy: 'Taught by {teacher}',
      upcomingCount: '{count} coming up',
      recordingCount: '{count} to watch again',
      workCount: '{count} to hand in',
      noneThisWeek: 'Nothing on this day',
      openSubject: 'Open {subject}',
      /** The learner's class, shown wherever the surface has room for it. */
      yourClass: 'Your class',
    },

    weekday: {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday',
    },

    /* ---------------------------------------------------------------- *
     * Past lessons
     * ---------------------------------------------------------------- */
    attendance: {
      title: 'Your attendance',
      subtitle: 'How many of your lessons you have joined.',
      none: 'No lessons yet',
      noneBody: 'Once you have had some lessons, your attendance will show here.',
      overall: 'Overall',
      attendedOf: 'You joined {attended} of {scheduled} lessons',
      streak: '{count} lessons in a row',
      streakOne: '1 lesson so far',
      bySubject: 'By subject',
      recent: 'Your recent lessons',
      present: 'Joined',
      absent: 'Missed',
      minutes: '{count} min',
      /* Never a reproach. A missed lesson is usually the power, not the child. */
      encourage: 'Missed a lesson? You can still watch the recording.',
    },

    lessons: {
      title: 'My past lessons',
      subtitle: 'Every lesson is recorded and kept for you, even the ones you missed.',
      none: 'No past lessons yet',
      noneBody: 'After your first class, you will be able to watch it again here.',
      watch: 'Watch again',
      watchAudio: 'Listen only',
      attended: 'You were there',
      missed: 'You missed this one',
      missedBody: 'You can still watch the recording.',
      minutesWatched: 'You were there for {count} minutes',
      /** NFR-USA-004: four different reasons, said precisely rather than as one. */
      processing: 'The recording will be ready within an hour',
      expired: 'This recording is no longer available',
      notRecorded: 'This lesson was not recorded',
      availableUntil: 'Available until {date}',
      filterAll: 'All subjects',
    },

    /* ---------------------------------------------------------------- *
     * Fees — a status, never a bill (see the fees service).
     * ---------------------------------------------------------------- */
    fees: {
      title: 'Fees',
      none: 'Nothing to show yet',
      noneBody: 'Your fee plan will show up here once it is set.',
      /** What a minor is told. No amount, no due date, no blame. */
      updates: 'Recent updates',
      registration: 'Registration',
      registrationHint: 'A one-off fee to enrol, separate from the parts below.',
      stillToPay: 'Still to pay',
      allPaid: 'All fees paid',
      paidOfTotal: '{paid} paid of {total}',
      progressLabel: 'How much of the fees have been paid',
      thePlan: 'The payment plan',
      guardianHandles: 'Your parent or guardian looks after your fees. We tell them what is due.',
      payInFull: 'Paid in one payment',
      threeInstalments: 'Paid in three parts',
      stage: 'Part {number}',
      stagePaid: 'Paid',
      stageDue: 'Due now',
      stageOverdue: 'Overdue',
      stageUpcoming: 'Not yet due',
      stageCancelled: 'Cancelled',
      completed: 'All fees paid — thank you',
      inProgress: '{paid} of {total} parts paid',
      notStarted: 'Not started yet',
      dueOn: 'Due {date}',
      paidOn: 'Paid {date}',
      /** Adult Learners only — they are their own payer. */
      total: 'Total',
      outstanding: 'Still to pay',
      pay: 'Pay now',
    },

    /* ---------------------------------------------------------------- *
     * Ratings
     * ---------------------------------------------------------------- */
    rating: {
      title: 'Rate your teacher',
      forSubject: 'How is {subject} going?',
      /** The promise, made plainly, because it is the reason to be honest. */
      anonymous: 'Your teacher never finds out who rated them.',
      anonymousLong:
        'Teachers only see their average score once enough students have rated them. They never see who said what, or when.',
      stars: '{count} out of 5',
      star1: 'Not good',
      star2: 'Could be better',
      star3: 'Alright',
      star4: 'Good',
      star5: 'Very good',
      commentLabel: 'Anything you want to add? (optional)',
      commentHelp: 'Please do not include your name, phone number or address.',
      submit: 'Send rating',
      submitted: 'Thank you — your rating has been sent',
      change: 'Change your rating',
      changeWindow: 'You can change this for the next 24 hours',
      yourRating: 'You rated this {stars} out of 5',
      notYet: 'You have not rated this teacher yet',
      noTeacher: 'You can rate your teacher once one has been assigned',
    },

    /* ---------------------------------------------------------------- *
     * Messages
     * ---------------------------------------------------------------- */

    classes: {
      title: 'Classes',
      upcoming: 'Coming up',
      past: 'Finished',
      none: 'No classes yet',
      noneBody: 'Your timetable will show up here once your classes are booked.',
      exportCalendar: 'Add to your calendar',
      /** FR-SCH-007 / UI-007: say the consequence before asking to confirm. */
      cancel: 'Cancel this class',
      cancelFree: 'You can cancel this class and keep it for another time.',
      cancelCharged: 'It is less than {hours} hours before this class. If you cancel now, this class is used up.',
      /** FR-LIV-013: the recording goes on the retention date, so say so. */
      recording: 'Watch the recording',
      recordingUntil: 'You can watch this until {date}',
      recordingPending: 'The recording will be ready within an hour',
      /** FR-SCH-002: assignment is an administrative action for minors. */
      bookingByStaff: 'The ClassConnect team books your classes for you.',
      book: 'Book a class',
      /** §1 — the four views, as a segmented control inside Classes. */
      view: {
        live: 'Live now',
        upcoming: 'Upcoming',
        attended: 'Attended',
        missed: 'Missed',
      },
      liveNow: 'Live now',
      elapsed: '{minutes} min so far',
      participants: '{count} in the class',
      join: 'Join the class',
      joinOpensIn: 'You can join in {time}',
      joinClosed: 'This class has ended',
      nextUp: 'Next class',
      noneLive: 'No class is running right now',
      noneLiveBody: 'When a class starts, the Join button appears here.',
      noneUpcoming: 'Nothing booked yet',
      noneAttended: 'No finished classes yet',
      noneAttendedBody: 'Classes you have attended will be listed here with what you did.',
      noneMissed: 'You have not missed a class',
      noneMissedBody: 'Nothing to catch up on. Keep it that way.',
      oneToOne: 'Just you and your teacher',
      group: 'Group class',
      minutes: '{count} min',
      attendedMinutes: 'You were in for {minutes} min',
      /**
       * §1.1 — neutral wording. Three of the four reasons are not the learner's
       * doing, and telling a child they "missed" a class their teacher cancelled
       * says something untrue about them.
       */
      miss: {
        learner_no_show: 'You did not join this class.',
        teacher_cancelled: 'Your teacher cancelled this class.',
        teacher_no_show: 'Your teacher did not join.',
        learner_cancelled: 'You cancelled this class.',
        attended_none: 'This class ran, but you were not in it.',
      },
      entitlementRestored: 'Your class was returned to you — this did not use one up.',
      entitlementUsed: 'This class was used up.',
      /** §1.2 — the detail view. */
      detail: {
        title: 'Class details',
        attendance: 'Your attendance',
        firstJoin: 'Joined at',
        lastLeave: 'Left at',
        totalMinutes: 'Total time connected',
        chat: 'Class chat',
        noChat: 'Nothing was written in the chat.',
        files: 'Files shared',
        noFiles: 'No files were shared.',
        homework: 'Work set in this class',
        noHomework: 'No work was set.',
        teacher: 'Your teacher',
        back: 'Back to classes',
      },
      /**
       * §1.3 — mic and camera, reported neutrally. Never scored, never ranked,
       * never shown to other learners.
       */
      stream: {
        title: 'Your microphone and camera',
        mic: 'Microphone',
        camera: 'Camera',
        on_throughout: 'On for the whole class',
        on_partly: 'On for {minutes} min',
        off_whole_session_by_choice: 'Off for the whole class',
        /**
         * FR-LIV-009 switches learner video off as bandwidth falls. Saying so is
         * required, not a nicety: the learner did not hide, the platform hid them.
         */
        off_whole_session_by_system: 'Off — switched off automatically to save data',
        explain: 'This is here so you and your family can see what happened. It is not a mark and nobody is ranked on it.',
      },
      /** §2 — asking to speak. The teacher decides, always. */
      speak: {
        ask: 'Ask to speak',
        asked: 'Your hand is up — waiting for your teacher',
        approved: 'Your teacher let you speak',
        dismissed: 'Your teacher did not take your hand this time',
        lower: 'Lower your hand',
        stop: 'Stop speaking',
        full: 'As many people as possible are already speaking. Try again shortly.',
        tooMany: 'You have asked a few times already. Give your teacher a moment.',
        explain: 'Your teacher has to say yes before your camera and microphone go out to the class.',
      },
    },

    /** §3 — recorded lessons. */
    recordings: {
      title: 'Recorded lessons',
      subtitle: 'Watch a class again',
      none: 'No recordings yet',
      noneBody: 'When a class you attended is recorded, it will appear here.',
      count: '{count} recording',
      countPlural: '{count} recordings',
      recordedOn: 'Recorded {date}',
      duration: '{minutes} min',
      /** §3: a recording that silently disappears in August is a support ticket. */
      availableUntil: 'Available until {date}',
      expiringSoon: 'Only {days} days left to watch this',
      /** NFR-BAN-002: say what it costs before it is spent. */
      size: '{size} of data',
      audioOnly: 'Listen only — uses much less data',
      audioSize: 'Listen only ({size})',
      watch: 'Watch',
      resume: 'Carry on from {time}',
      backToSubjects: 'All subjects',
    },

    /** §4 — exams. */
    exams: {
      title: 'Exams',
      subtitle: 'Take an exam, and see every one you have taken',
      available: 'Ready to take',
      history: 'Your exams so far',
      none: 'No exams yet',
      noneBody: 'When your teacher sets an exam, it will appear here.',
      noneHistory: 'You have not taken an exam yet',
      start: 'Start this exam',
      resume: 'Carry on with this exam',
      durationMin: '{minutes} minutes',
      questions: '{count} questions',
      setBy: 'Set by {teacher}',
      markedBy: 'Marked by {teacher}',
      takenOn: 'Taken {date}',
      timeTaken: 'Took you {minutes} min',
      score: '{score} out of {total}',
      percentage: '{percent}%',
      cohortMean: 'Class average {percent}%',
      byTopic: 'How you did, topic by topic',
      trend: 'Your scores over time',
      /** FR-ASM-003: a partial score shown as final is a lie. */
      awaitingMarking: 'Waiting for your teacher to mark the written answers',
      awaitingMarkingBody: 'The score below counts only the questions the system can mark.',
      /** FR-ASM-010: an override is shown as an override. */
      overridden: 'Your teacher adjusted this mark',
      overriddenBy: 'Adjusted by {teacher} on {date}',
      filterSubject: 'Subject',
      filterAll: 'All subjects',
      messageTeacher: 'Message this teacher',

      /** §4.2 — the pre-exam gate. */
      gate: {
        title: 'Before you start',
        deviceCheck: 'Check your microphone and camera',
        micOk: 'Microphone is working',
        micBad: 'We cannot hear your microphone',
        cameraOk: 'Camera is working',
        cameraBad: 'We cannot see your camera',
        bandwidth: 'Your connection: {kbps} kbps',
        retry: 'Check again',
        /** §4.2.3 — plain language, both languages, before consent. */
        disclosureTitle: 'What is recorded while you take this exam',
        disclosureMic: 'Your microphone stays on for the whole exam, and the sound is listened to for background noise.',
        disclosureCamera: 'Your camera stays on for the whole exam.',
        disclosureNoise: 'If loud noise is picked up three times, the exam will stop and a person from ClassConnect will look at what happened.',
        disclosureStored: 'Short sound clips and pictures from your camera are kept for {days} days.',
        disclosureWho: 'Only your teacher, your parent or guardian, and ClassConnect staff can see them.',
        acknowledge: 'I have read this and I am ready to start',
        /** §4.2.1 — no consent is not the same as no exam. */
        consentNeeded: 'Your parent or guardian needs to agree before you can take a watched exam',
        consentNeededBody: 'They will be asked once. In the meantime you can take this exam without watching, or ask your teacher to sit it with you.',
        takeUnproctored: 'Take it without watching',
        cannotStart: 'You cannot start this exam yet',
      },

      /** §4.3 / §4.4 — the runner. */
      runner: {
        remaining: 'Time left',
        warningMinutes: '{minutes} minutes left',
        saved: 'Saved',
        saving: 'Saving…',
        savedAt: 'Your answers were saved at {time}',
        question: 'Question {number} of {total}',
        section: 'Section {name}',
        previous: 'Back',
        next: 'Next',
        submit: 'Finish and hand in',
        submitConfirm: 'Hand this in? You cannot change your answers afterwards.',
        autoSubmitted: 'Time ran out, so your answers were handed in automatically.',
        /** FR-ASM-007: reconnection is the normal case here, not an edge case. */
        reconnecting: 'Connection lost — your answers are safe',
        reconnectingBody: 'We are getting you back in. Nothing you have typed is lost.',
        resumed: 'You are back. Your answers were kept and the clock kept running.',
        /** §4.3 — the noise ladder. */
        noiseWarning: 'We can hear background noise. Please find a quieter spot if you can.',
        noiseFinal: 'That is the last warning — one more and the exam will stop.',
        micRequired: 'Your microphone must stay on',
        cameraRequired: 'Your camera must stay on',
        streamGrace: 'Turn it back on within {seconds} seconds or the exam will stop.',
        stopped: 'The exam has stopped',
        stoppedNoise: 'Background noise was picked up three times, so the exam stopped.',
        stoppedMic: 'Your microphone was off, so the exam stopped.',
        stoppedCamera: 'Your camera was off, so the exam stopped.',
        /**
         * The system stops the sitting. It does not mark the paper — FR-AI-005
         * and FR-ASM-007 both survive the stop, and a learner who is not told
         * their answers were kept will assume they were not.
         */
        stoppedKept: 'Everything you answered has been handed in and saved.',
        stoppedReview: 'A person from ClassConnect will look at what happened and decide. You will be told the outcome.',
        stoppedRespond: 'You can tell us what was going on',
        yourStatement: 'What was happening?',
        sendStatement: 'Send this',
        statementSent: 'Thank you — this will be read alongside the recording.',
      },

      /** §4.1 — an attempt under review. */
      review: {
        flagged: 'Being looked at',
        flaggedBody: 'This exam is with a person from ClassConnect. Your score is not final yet.',
        outcomeUpheld: 'Reviewed — your result stands',
        outcomeDismissed: 'Reviewed — nothing was wrong',
        outcomeVoided: 'Reviewed — this attempt does not count',
      },
    },

    /** §5 — messages. */
    messages: {
      title: 'Messages',
      subtitle: 'Talk to your teachers and to ClassConnect',
      none: 'No messages yet',
      noneBody: 'Message a teacher from their class, or write to ClassConnect below.',
      newThread: 'Start a message',
      toTeacher: 'Message a teacher',
      toSupport: 'Message ClassConnect',
      teachers: 'Your teachers',
      support: 'ClassConnect',
      write: 'Write a message',
      send: 'Send',
      sending: 'Sending…',
      you: 'You',
      today: 'Today',
      yesterday: 'Yesterday',
      /** Staff-side safeguarding redaction only — see the messaging service. */
      deleted: 'This message was deleted.',
      edited: 'edited',
      /** §5.2 — say why the text changed, rather than silently altering it. */
      redacted: 'Phone numbers, emails and other contact details are removed automatically.',
      redactedNotice: 'Some contact details were removed from your message. Everything on ClassConnect stays on ClassConnect.',
      /** §5.3 — attachments. */
      attach: 'Add a file',
      attachPhoto: 'Photo',
      attachVideo: 'Video',
      attachFile: 'File',
      attachVoice: 'Voice note',
      recording: 'Recording… {seconds}s',
      stopRecording: 'Stop',
      voiceMax: 'Voice notes can be up to {seconds} seconds',
      attachmentSize: '{size}',
      /** FR-FIL-001: nothing is downloadable before it has passed a scan. */
      scanning: 'Checking this file…',
      scanFailed: 'This file did not pass our safety check and was not sent.',
      tooLarge: 'That file is too big. The limit is {size}.',
      typeNotAllowed: 'That kind of file cannot be sent.',
      /**
       * The no-delete rule, told to the person it constrains, before they send.
       *
       * A learner who does not know a message is permanent will discover it at
       * the worst possible moment. Saying so up front is not a warning, it is
       * the safeguarding control doing its job: it changes what gets sent.
       */
      permanent: 'Messages cannot be deleted once sent.',
      permanentLong:
        'Once you send a message it stays in this conversation. Neither you nor your teacher can delete it. This keeps everyone safe.',
      teacherUnavailable: 'This teacher is not available right now. Contact ClassConnect help.',
      closed: 'This conversation is closed. You can still read it.',
      empty: 'Write something first',
      openThread: 'Open conversation with {name}',
      placeholder: 'Write your message',
      compose: 'Write a message',
      attachmentTooBig: 'Files must be smaller than {size}',
      /* Starting a conversation. Teachers and support only — see the service. */
      newMessage: 'New message',
      chooseContact: 'Who do you want to message?',
      searchContacts: 'Search your teachers',
      searchNoResults: 'No one matches that',
      searchNoResultsBody: 'You can message the teachers who teach you, and ClassConnect help.',
      onlyYourTeachers: 'You can message your own teachers and ClassConnect help.',
      startWith: 'Message {name}',
      openExisting: 'Open conversation',
      uploading: 'Sending…',
      attachmentReady: 'Ready',
      unreadCount: '{count} unread messages',
      unreadOne: '1 unread message',
      attachmentPending: 'Being checked…',
      voiceNote: 'Voice note',
      recordVoice: 'Record a voice note',
      voiceUnsupported: 'Voice notes need microphone permission. Check your browser settings.',
      openImage: 'Open {name}',
      preview: 'Preview',
      attachmentBlocked: 'This file could not be sent',
      previewOpen: 'Open to check',
      attachmentTimeout: 'That took too long. Check your connection and try again.',
      reportConcern: 'Report a concern about this conversation',
    },

    work: {
      title: 'Work',
      toDo: 'To do',
      submitted: 'Handed in',
      graded: 'Marked',
      materials: 'Reading and notes',
      noneToDo: 'Nothing to do right now',
      noneToDoBody: 'When a teacher sets you some work, it will show up here.',
      noneSubmitted: 'Nothing waiting to be marked',
      noneSubmittedBody: 'Work you hand in shows here until your teacher marks it.',
      noneGraded: 'Nothing marked yet',
      noneGradedBody: 'Your marks and your teacher’s comments will show here.',
      noneMaterials: 'No notes yet',
      noneMaterialsBody: 'Notes and reading from your teachers will show here.',
      savedOffline: 'Saved to read offline',
      /*
       * BUILD-PLAN Phase 2. "Keep" rather than "download": the brief's point is
       * that a learner can read the lesson again with no signal, and that is
       * what the word has to promise.
       */
      openMaterial: 'Keep to read offline',
      openingMaterial: 'Getting it…',
      materialFailed: 'We could not open that. Try again in a moment.',
    },

    practice: {
      title: 'Practice',
      quizzes: 'Quizzes',
      mocks: 'Mock exams',
      pastPapers: 'Past questions',
      none: 'Nothing to practise yet',
      noneBody: 'Quizzes and past questions will show up here as your teachers add them.',
      /** §9: timed work is never available offline, and says so plainly. */
      needsConnection: 'You need to be online to start this',
      needsConnectionBody: 'A timed test cannot be started while you are offline. Try again when you have a connection.',
    },

    progress: {
      title: 'Progress',
      attendance: 'Classes attended',
      homework: 'Work handed in',
      onTime: 'Handed in on time',
      scores: 'Your marks',
      strengths: 'What is going well',
      weaknesses: 'What to work on',
      teacherComments: 'What your teachers say',
      revisionPlan: 'Your revision plan',
      none: 'Nothing to show yet',
      noneBody: 'Once you have been to some classes and handed in some work, your progress will show here.',
    },

    /**
     * §6 — the frozen account.
     *
     * NEEDS_HUMAN_COPY (Q3). The structure is right and the prohibitions are
     * enforced: nothing here names an amount, a due date or a schedule, and
     * nothing blames the learner. The words themselves still need a human
     * writer — this is the screen a stressed family sees on the worst day of
     * their month.
     */
    frozen: {
      minorTitle: 'Some things are paused just now',
      minorBody:
        'A payment is needed before your classes can start again. We have told your parent or guardian, so you do not need to do anything.',
      minorStillOpen: 'You can still use these',
      minorStillOpenBody:
        'Your timetable, work that has already been marked, and anything you saved to read offline.',
      adultTitle: 'Your classes are paused',
      adultBody:
        'There is a payment outstanding on your account. Once it is paid, everything starts working again straight away.',
      adultPay: 'Make a payment',
      adultAmount: '{amount} FCFA outstanding',
      blockedAction: 'This is paused until the payment is made.',
      contactSupport: 'Get help',
      resolvedTitle: 'Everything is back on',
      resolvedBody: 'Thank you. Your classes and your work are available again.',
    },

    /** FR-SAF-005: reachable from every session, thread and teacher profile. */
    report: {
      concern: 'Report a concern',
      concernHint: 'Tell us if something here worries you. A person will read it.',
    },

    /** FR-SAF-004 / FR-LIV-012: disclosed at booking and again at join. */
    recording: {
      disclosureBooking: 'This class will be recorded.',
      disclosureJoin: 'This class is being recorded.',
      indicator: 'Recording',
    },

    /** NFR-BAN-006: nothing fails silently, and every failure offers a way on. */
    error: {
      loadTitle: 'We could not load this',
      loadBody: 'This is usually the connection. Check your signal and try again.',
      retry: 'Try again',
      offlineTitle: 'You are offline',
      offlineBody: 'We will show you this as soon as you have a connection again.',
    },

    /** Units and small connective phrases the screens interpolate. */
    unit: {
      minutes: '{count} min',
      questions: '{count} questions',
      oneQuestion: '1 question',
      attempts: '{used} of {allowed} tries used',
      attemptsLeft: '{count} tries left',
      best: 'Best {percent}%',
      percent: '{value}%',
      outOf: '{value} of {total}',
      paperNo: 'Paper {number}',
      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      inMinutes: 'in {count} min',
      inHours: 'in {count} h',
      inDays: 'in {count} days',
    },

    /** Appendix A's session outcomes, in words a learner uses. */
    sessionStatus: {
      scheduled: 'Coming up',
      in_progress: 'Happening now',
      completed: 'Finished',
      cancelled_by_learner: 'You cancelled this',
      cancelled_by_teacher: 'Your teacher cancelled this',
      no_show_teacher: 'Your teacher did not come',
      no_show_learner: 'You missed this one',
      aborted: 'Stopped early',
      disputed: 'Being looked into',
      voided: 'Cancelled',
    },

    /**
     * FR-GCE-004: the plain-language account of what moves the number.
     *
     * Named inputs with their own values, so a learner can check the figure
     * against the rest of the screen instead of taking it on trust.
     */
    readinessDriver: {
      practice: 'Your practice scores',
      homework: 'Work you have finished',
      attendance: 'Classes you attended',
    },

    /** UI-006: skippable, and re-runnable from the help menu. */
    tour: {
      skip: 'Skip',
      next: 'Next',
      done: 'Got it',
      restart: 'Show me around again',
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
