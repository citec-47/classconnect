/**
 * Seed data — DAT-011.
 *
 * "The system shall ship with seed data for levels, subjects, plans
 *  (per FR-PAY-002), notification templates and FAQ articles in both languages."
 *
 * Everything here is idempotent, so `npm run db:seed` is safe to re-run.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { CONFIG_DEFAULTS } from '../../shared/src/config-keys';

const prisma = new PrismaClient();

/**
 * FR-PRO-001: education-level taxonomy covering Primary (Classes 1–6),
 * Secondary (Forms 1–5), High School (Lower Sixth, Upper Sixth), GCE O/L,
 * GCE A/L, and Adult GCE.
 */
const LEVELS: {
  code: string;
  nameEn: string;
  nameFr: string;
  schoolType: 'primary' | 'secondary';
  category: string;
}[] = [
  // Primary school — Class 1 to Class 6.
  ...Array.from({ length: 6 }, (_, i) => ({
    code: `PRIMARY_${i + 1}`,
    nameEn: `Class ${i + 1}`,
    nameFr: `Cours ${i + 1}`,
    schoolType: 'primary' as const,
    category: 'primary',
  })),

  // Secondary school — Form 1 to Form 5, then Lower and Upper Sixth.
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `FORM_${i + 1}`,
    nameEn: `Form ${i + 1}`,
    nameFr: `${i + 1}ᵉ année`,
    schoolType: 'secondary' as const,
    category: 'secondary',
  })),
  {
    code: 'LOWER_SIXTH',
    nameEn: 'Lower Sixth',
    nameFr: 'Première',
    schoolType: 'secondary' as const,
    category: 'high_school',
  },
  {
    code: 'UPPER_SIXTH',
    nameEn: 'Upper Sixth',
    nameFr: 'Terminale',
    schoolType: 'secondary' as const,
    category: 'high_school',
  },

  // FR-PRO-001 also requires the GCE examination tracks and Adult GCE. They are
  // secondary-school levels: a learner sitting GCE O/L is in secondary school,
  // so they appear under that school type rather than as a third option.
  {
    code: 'GCE_OL',
    nameEn: 'GCE Ordinary Level',
    nameFr: 'GCE niveau Ordinaire',
    schoolType: 'secondary' as const,
    category: 'exam',
  },
  {
    code: 'GCE_AL',
    nameEn: 'GCE Advanced Level',
    nameFr: 'GCE niveau Avancé',
    schoolType: 'secondary' as const,
    category: 'exam',
  },
  {
    code: 'ADULT_GCE',
    nameEn: 'Adult GCE',
    nameFr: 'GCE adultes',
    schoolType: 'secondary' as const,
    category: 'adult',
  },
];

/**
 * FR-PRO-002: a subject catalogue aligned to the Cameroon GCE Board subject
 * list for examination levels.
 *
 * `isScience` drives the Science plan in FR-PAY-002.
 */
const SUBJECTS: {
  code: string;
  nameEn: string;
  nameFr: string;
  isScience: boolean;
  categories: string[];
}[] = [
  { code: 'ENG', nameEn: 'English Language', nameFr: 'Anglais', isScience: false, categories: ['primary', 'secondary', 'high_school', 'exam', 'adult'] },
  { code: 'FRE', nameEn: 'French', nameFr: 'Français', isScience: false, categories: ['primary', 'secondary', 'high_school', 'exam', 'adult'] },
  { code: 'LIT', nameEn: 'Literature in English', nameFr: 'Littérature anglaise', isScience: false, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'MATH', nameEn: 'Mathematics', nameFr: 'Mathématiques', isScience: false, categories: ['primary', 'secondary', 'high_school', 'exam', 'adult'] },
  { code: 'FMATH', nameEn: 'Further Mathematics', nameFr: 'Mathématiques approfondies', isScience: true, categories: ['high_school', 'exam', 'adult'] },
  { code: 'PHY', nameEn: 'Physics', nameFr: 'Physique', isScience: true, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'CHE', nameEn: 'Chemistry', nameFr: 'Chimie', isScience: true, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'BIO', nameEn: 'Biology', nameFr: 'Biologie', isScience: true, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'CSC', nameEn: 'Computer Science', nameFr: 'Informatique', isScience: true, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'GEO', nameEn: 'Geography', nameFr: 'Géographie', isScience: false, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'HIS', nameEn: 'History', nameFr: 'Histoire', isScience: false, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'ECO', nameEn: 'Economics', nameFr: 'Économie', isScience: false, categories: ['high_school', 'exam', 'adult'] },
  { code: 'CMR', nameEn: 'Commerce', nameFr: 'Commerce', isScience: false, categories: ['secondary', 'high_school', 'exam', 'adult'] },
  { code: 'ACC', nameEn: 'Accounting', nameFr: 'Comptabilité', isScience: false, categories: ['high_school', 'exam', 'adult'] },
  { code: 'CIT', nameEn: 'Citizenship Education', nameFr: 'Éducation à la citoyenneté', isScience: false, categories: ['primary', 'secondary'] },
  { code: 'RS', nameEn: 'Religious Studies', nameFr: 'Éducation religieuse', isScience: false, categories: ['secondary', 'high_school', 'exam'] },
  { code: 'SCI', nameEn: 'General Science', nameFr: 'Sciences générales', isScience: true, categories: ['primary'] },
];

/**
 * FR-PAY-002: the seeded plans, all editable by Admin without a code change.
 *
 * CON-02: prices are whole XAF as BigInt.
 *
 * OI-03 is unresolved — the brief fixes the prices but not what they entitle a
 * learner to. The entitlement sets below are therefore explicitly marked
 * provisional and carry the open issue, so nobody mistakes a placeholder for a
 * commercial decision. FR-PAY-006 enforces whatever lands here.
 */
const PLANS: {
  code: string;
  nameEn: string;
  nameFr: string;
  levelScope: string;
  period: 'monthly' | 'annual';
  priceXaf: bigint;
  entitlements: Prisma.InputJsonValue;
}[] = [
  {
    code: 'PRIMARY_MONTHLY',
    nameEn: 'Primary, monthly',
    nameFr: 'Primaire, mensuel',
    levelScope: 'primary',
    period: 'monthly',
    priceXaf: 10_000n,
    entitlements: provisional({ sessionsPerWeek: 2, sessionType: 'one_to_one', subjects: 2, mockExams: 0 }),
  },
  {
    code: 'PRIMARY_ANNUAL',
    nameEn: 'Primary, annual',
    nameFr: 'Primaire, annuel',
    levelScope: 'primary',
    period: 'annual',
    priceXaf: 35_000n,
    entitlements: provisional({ sessionsPerWeek: 2, sessionType: 'one_to_one', subjects: 2, mockExams: 0 }),
  },
  {
    code: 'SECONDARY_MONTHLY',
    nameEn: 'Secondary, monthly',
    nameFr: 'Secondaire, mensuel',
    levelScope: 'secondary',
    period: 'monthly',
    priceXaf: 15_000n,
    entitlements: provisional({ sessionsPerWeek: 3, sessionType: 'one_to_one', subjects: 3, mockExams: 1 }),
  },
  {
    code: 'SECONDARY_ANNUAL',
    nameEn: 'Secondary, annual',
    nameFr: 'Secondaire, annuel',
    levelScope: 'secondary',
    period: 'annual',
    priceXaf: 40_000n,
    entitlements: provisional({ sessionsPerWeek: 3, sessionType: 'one_to_one', subjects: 3, mockExams: 1 }),
  },
  {
    code: 'EXAM_ANNUAL',
    nameEn: 'Examination classes, annual',
    nameFr: 'Classes d’examen, annuel',
    levelScope: 'exam',
    period: 'annual',
    priceXaf: 50_000n,
    entitlements: provisional({ sessionsPerWeek: 4, sessionType: 'mixed', subjects: 4, mockExams: 6 }),
  },
  {
    code: 'SCIENCE_ANNUAL',
    nameEn: 'Science classes, annual',
    nameFr: 'Classes scientifiques, annuel',
    levelScope: 'science',
    period: 'annual',
    priceXaf: 60_000n,
    entitlements: provisional({ sessionsPerWeek: 4, sessionType: 'mixed', subjects: 4, mockExams: 6 }),
  },
];

function provisional(entitlements: Record<string, unknown>): Prisma.InputJsonValue {
  return {
    ...entitlements,
    materialsAccess: true,
    _provisional: true,
    _openIssue: 'OI-03: entitlements are undefined in the brief and must be set commercially',
  } as Prisma.InputJsonValue;
}

/**
 * FR-NOT-002: the notification catalogue. Each event type defines its default
 * channels, priority, EN and FR templates, and whether the user may disable it.
 * FR-NOT-003: transactional and safety notifications are not disableable.
 */
const TEMPLATES: {
  eventType: string;
  defaultChannels: ('in_app' | 'email' | 'sms' | 'whatsapp')[];
  priority: string;
  userDisableable: boolean;
  subjectEn?: string;
  subjectFr?: string;
  bodyEn: string;
  bodyFr: string;
}[] = [
  {
    eventType: 'auth.otp',
    defaultChannels: ['sms'],
    priority: 'critical',
    userDisableable: false,
    bodyEn: 'Your ClassConnect code is {code}. It expires in {minutes} minutes. Do not share it.',
    bodyFr: 'Votre code ClassConnect est {code}. Il expire dans {minutes} minutes. Ne le partagez pas.',
  },
  {
    eventType: 'welcome',
    defaultChannels: ['in_app', 'sms'],
    priority: 'normal',
    userDisableable: true,
    subjectEn: 'Welcome to ClassConnect',
    subjectFr: 'Bienvenue sur ClassConnect',
    bodyEn: 'Hello {name}, your ClassConnect account is ready.',
    bodyFr: 'Bonjour {name}, votre compte ClassConnect est prêt.',
  },
  {
    eventType: 'accountLocked',
    defaultChannels: ['sms', 'email'],
    priority: 'critical',
    userDisableable: false,
    subjectEn: 'Sign-in attempts on your account',
    subjectFr: 'Tentatives de connexion sur votre compte',
    bodyEn: 'We locked your account for {minutes} minutes after several failed sign-in attempts. If this was not you, please contact support.',
    bodyFr: 'Nous avons verrouillé votre compte pendant {minutes} minutes après plusieurs échecs de connexion. Si ce n’était pas vous, contactez l’assistance.',
  },
  {
    eventType: 'teacherApplicationSubmitted',
    defaultChannels: ['in_app', 'sms'],
    priority: 'normal',
    userDisableable: false,
    subjectEn: 'We received your application',
    subjectFr: 'Nous avons reçu votre candidature',
    bodyEn: 'Hello {name}, we have your teaching application and will review it shortly.',
    bodyFr: 'Bonjour {name}, nous avons votre candidature et l’examinerons sous peu.',
  },
  {
    eventType: 'teacherApproved',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'You are verified',
    subjectFr: 'Vous êtes vérifié',
    bodyEn: 'Hello {name}, your application is approved. You can now be assigned learners.',
    bodyFr: 'Bonjour {name}, votre candidature est approuvée. Des apprenants peuvent vous être attribués.',
  },
  {
    eventType: 'teacherRejected',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'About your application',
    subjectFr: 'À propos de votre candidature',
    bodyEn: 'Hello {name}, we could not approve your application. Reason: {reason}. You may apply again.',
    bodyFr: 'Bonjour {name}, nous n’avons pas pu approuver votre candidature. Motif : {reason}. Vous pouvez postuler à nouveau.',
  },
  {
    eventType: 'teacherMoreInfo',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'We need a little more',
    subjectFr: 'Il nous manque un élément',
    bodyEn: 'Hello {name}, we need more information before we can finish: {reason}.',
    bodyFr: 'Bonjour {name}, il nous faut plus d’informations avant de conclure : {reason}.',
  },
  {
    eventType: 'teacherSuspended',
    defaultChannels: ['in_app', 'sms', 'email'],
    priority: 'critical',
    userDisableable: false,
    subjectEn: 'Your account is suspended',
    subjectFr: 'Votre compte est suspendu',
    bodyEn: 'Hello {name}, your teaching account is suspended pending review. Reason: {reason}.',
    bodyFr: 'Bonjour {name}, votre compte enseignant est suspendu en attente d’examen. Motif : {reason}.',
  },
  {
    // An Admin created this teacher's account; they did not apply for it, so
    // they are told it exists and how to sign in.
    eventType: 'teacherAccountCreated',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'Your ClassConnect teaching account is ready',
    subjectFr: 'Votre compte enseignant ClassConnect est prêt',
    bodyEn: 'Hello {name}, an administrator has created your ClassConnect teaching account. Sign in with this phone number and the password you were given.',
    bodyFr: 'Bonjour {name}, un administrateur a créé votre compte enseignant ClassConnect. Connectez-vous avec ce numéro et le mot de passe qui vous a été remis.',
  },
  {
    // FR-FAM-001: the guardian is told when a student is linked to them.
    eventType: 'studentAccountCreated',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'A student account was added to your family',
    subjectFr: 'Un compte élève a été ajouté à votre famille',
    bodyEn: 'Hello {name}, an account for {studentName} has been created and linked to you. You can see their class, subjects and progress in ClassConnect.',
    bodyFr: 'Bonjour {name}, un compte pour {studentName} a été créé et rattaché à vous. Vous pouvez voir sa classe, ses matières et ses progrès dans ClassConnect.',
  },
  {
    // FR-FIL-001: "a file failing the scan shall be quarantined and the
    // uploader notified."
    eventType: 'fileQuarantined',
    defaultChannels: ['in_app', 'sms'],
    priority: 'high',
    userDisableable: false,
    subjectEn: 'A file could not be accepted',
    subjectFr: 'Un fichier n’a pas pu être accepté',
    bodyEn: 'Hello {name}, the file "{fileName}" did not pass our safety check and was removed. Please scan your device and upload a different copy.',
    bodyFr: 'Bonjour {name}, le fichier « {fileName} » n’a pas passé notre contrôle de sécurité et a été supprimé. Analysez votre appareil et envoyez une autre copie.',
  },
  {
    eventType: 'sessionCancelledTeacherSuspended',
    defaultChannels: ['in_app', 'sms'],
    priority: 'critical',
    userDisableable: false,
    subjectEn: 'A change to your lessons',
    subjectFr: 'Un changement dans vos cours',
    bodyEn: 'Some upcoming lessons were cancelled and we are arranging another teacher. We will confirm the new times shortly.',
    bodyFr: 'Certains cours à venir ont été annulés et nous organisons un autre enseignant. Nous confirmerons les nouveaux horaires sous peu.',
  },
];

/** DAT-011: FAQ / knowledge-base articles in both languages (FR-SUP-005). */
const FAQ: { slug: string; titleEn: string; titleFr: string; bodyEn: string; bodyFr: string }[] = [
  {
    slug: 'how-payment-works',
    titleEn: 'How do I pay for lessons?',
    titleFr: 'Comment payer les cours ?',
    bodyEn: 'You can pay with MTN Mobile Money or Orange Money. Choose your plan, tap Pay, then approve the prompt that appears on your phone. Your subscription starts as soon as the payment is confirmed.',
    bodyFr: 'Vous pouvez payer avec MTN Mobile Money ou Orange Money. Choisissez votre formule, appuyez sur Payer, puis validez la demande qui s’affiche sur votre téléphone. Votre abonnement démarre dès la confirmation du paiement.',
  },
  {
    slug: 'teacher-verification',
    titleEn: 'How are teachers checked?',
    titleFr: 'Comment les enseignants sont-ils vérifiés ?',
    bodyEn: 'Every teacher sends us their identity document and their qualifications. A member of our team checks each document by hand before the teacher can be given any learner. Teachers are never matched with a learner before that check is complete.',
    bodyFr: 'Chaque enseignant nous transmet sa pièce d’identité et ses diplômes. Un membre de notre équipe vérifie chaque document à la main avant qu’un apprenant lui soit confié. Aucun enseignant n’est mis en relation avec un apprenant avant cette vérification.',
  },
  {
    slug: 'poor-connection',
    titleEn: 'What if my connection is weak?',
    titleFr: 'Que faire si ma connexion est faible ?',
    bodyEn: 'The lesson adapts on its own. Video quality drops first, then video switches off, leaving sound, the whiteboard and chat working. You can also choose "audio only" before or during a lesson to use much less data.',
    bodyFr: 'Le cours s’adapte tout seul. La qualité vidéo baisse d’abord, puis la vidéo se coupe, en laissant le son, le tableau blanc et la discussion. Vous pouvez aussi choisir « audio seulement » avant ou pendant un cours pour consommer beaucoup moins de données.',
  },
  {
    slug: 'child-safety',
    titleEn: 'How do you keep my child safe?',
    titleFr: 'Comment protégez-vous mon enfant ?',
    bodyEn: 'All contact between a teacher and your child happens inside ClassConnect. Personal phone numbers and emails are never shared. One-to-one lessons with children are recorded by default, and you can see every message, recording and piece of feedback belonging to your child. There is a "report a concern" button on every lesson and message.',
    bodyFr: 'Tout contact entre un enseignant et votre enfant se fait dans ClassConnect. Les numéros personnels et les adresses e-mail ne sont jamais partagés. Les cours individuels avec des enfants sont enregistrés par défaut, et vous pouvez consulter tous les messages, enregistrements et retours concernant votre enfant. Un bouton « signaler un problème » est présent sur chaque cours et chaque message.',
  },
];

async function main(): Promise<void> {
  console.log('Seeding ClassConnect reference data (DAT-011)…');

  // --- Levels -------------------------------------------------------------
  for (const [index, level] of LEVELS.entries()) {
    await prisma.level.upsert({
      where: { code: level.code },
      create: { ...level, sortOrder: index * 10 },
      update: {
        nameEn: level.nameEn,
        nameFr: level.nameFr,
        schoolType: level.schoolType,
        category: level.category,
        sortOrder: index * 10,
      },
    });
  }
  console.log(`  levels: ${LEVELS.length}`);

  // --- Subjects -----------------------------------------------------------
  for (const [index, subject] of SUBJECTS.entries()) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      create: {
        code: subject.code,
        nameEn: subject.nameEn,
        nameFr: subject.nameFr,
        isScience: subject.isScience,
        sortOrder: index * 10,
      },
      update: {
        nameEn: subject.nameEn,
        nameFr: subject.nameFr,
        isScience: subject.isScience,
        sortOrder: index * 10,
      },
    });
  }
  console.log(`  subjects: ${SUBJECTS.length}`);

  // --- Level ↔ subject mapping -------------------------------------------
  const levelRows = await prisma.level.findMany();
  const subjectRows = await prisma.subject.findMany();
  const levelByCode = new Map(levelRows.map((l) => [l.code, l]));
  const subjectByCode = new Map(subjectRows.map((s) => [s.code, s]));

  let mappings = 0;
  for (const subject of SUBJECTS) {
    const subjectRow = subjectByCode.get(subject.code);
    if (!subjectRow) continue;

    for (const level of LEVELS) {
      if (!subject.categories.includes(level.category)) continue;
      const levelRow = levelByCode.get(level.code);
      if (!levelRow) continue;

      await prisma.levelSubject.upsert({
        where: { levelId_subjectId: { levelId: levelRow.id, subjectId: subjectRow.id } },
        create: { levelId: levelRow.id, subjectId: subjectRow.id },
        update: {},
      });
      mappings++;
    }
  }
  console.log(`  level-subject mappings: ${mappings}`);

  // --- Plans (FR-PAY-002) -------------------------------------------------
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        nameEn: plan.nameEn,
        nameFr: plan.nameFr,
        levelScope: plan.levelScope,
        period: plan.period,
        priceXaf: plan.priceXaf,
        entitlementsJson: plan.entitlements,
      },
      // Prices are Admin-editable at runtime (FR-PAY-002); re-seeding must not
      // silently revert a commercial decision, so only the naming is refreshed.
      update: { nameEn: plan.nameEn, nameFr: plan.nameFr },
    });
  }
  console.log(`  plans: ${PLANS.length}`);

  // --- Notification templates (FR-NOT-002) --------------------------------
  for (const template of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { eventType: template.eventType },
      create: {
        eventType: template.eventType,
        defaultChannels: template.defaultChannels,
        priority: template.priority,
        userDisableable: template.userDisableable,
        subjectEn: template.subjectEn ?? null,
        subjectFr: template.subjectFr ?? null,
        bodyEn: template.bodyEn,
        bodyFr: template.bodyFr,
      },
      update: {
        defaultChannels: template.defaultChannels,
        priority: template.priority,
        userDisableable: template.userDisableable,
        subjectEn: template.subjectEn ?? null,
        subjectFr: template.subjectFr ?? null,
        bodyEn: template.bodyEn,
        bodyFr: template.bodyFr,
      },
    });
  }
  console.log(`  notification templates: ${TEMPLATES.length}`);

  // --- Platform configuration (CON-07) ------------------------------------
  let configCount = 0;
  for (const [key, value] of Object.entries(CONFIG_DEFAULTS)) {
    await prisma.platformConfig.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description: 'Seeded from SRS default' },
      // Never overwrite an operator's change on re-seed.
      update: {},
    });
    configCount++;
  }
  console.log(`  configuration keys: ${configCount}`);

  // --- FAQ (FR-SUP-005, DAT-011) ------------------------------------------
  // Stored as configuration rows until the knowledge-base module lands, so the
  // bilingual content exists and is not lost.
  await prisma.platformConfig.upsert({
    where: { key: 'support.faq' },
    create: {
      key: 'support.faq',
      value: FAQ as unknown as Prisma.InputJsonValue,
      description: 'Bilingual FAQ articles (FR-SUP-005)',
    },
    update: { value: FAQ as unknown as Prisma.InputJsonValue },
  });
  console.log(`  FAQ articles: ${FAQ.length}`);

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
