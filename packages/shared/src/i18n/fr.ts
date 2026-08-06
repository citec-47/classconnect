/**
 * French message catalogue.
 *
 * NFR-LOC-001: French is a first-class language, not a translation layer added
 * later. The type below is structurally checked against the English catalogue,
 * so a missing French string is a compile error rather than a gap a user finds.
 * Acceptance criterion 8 (§9.2) requires no untranslated string at release.
 */
import type { Messages } from './en';

export const fr: Messages = {
  common: {
    appName: 'ClassConnect',
    tagline: 'Apprenez avec des enseignants vérifiés, partout au Cameroun',
    continue: 'Continuer',
    back: 'Retour',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    delete: 'Supprimer',
    edit: 'Modifier',
    close: 'Fermer',
    loading: 'Chargement…',
    search: 'Rechercher',
    filter: 'Filtrer',
    none: 'Aucun',
    notRecorded: 'Non renseigné',
    yes: 'Oui',
    no: 'Non',
    required: 'Obligatoire',
    optional: 'Facultatif',
    signOut: 'Se déconnecter',
    language: 'Langue',
    english: 'English',
    french: 'Français',
    skip: 'Passer',
    retry: 'Réessayer',
    offline: 'Vous êtes hors ligne. Nous avons gardé votre place et réessaierons à la reconnexion.',
    skipToContent: 'Aller au contenu',
    everyTeacherChecked:
      'Chaque enseignant est vérifié à la main avant son premier cours.',
    notAnExamBody:
      'ClassConnect est un service de préparation. Nous ne sommes ni le GCE Board ni un organisme d’examen.',
  },

  landing: {
    eyebrow: 'Cameroun · anglais et français',
    headline: 'Des cours en direct, avec des enseignants que nous vérifions nous-mêmes.',
    subhead:
      'ClassConnect met les élèves du primaire, du secondaire et du GCE en face d’enseignants qualifiés. Sur le téléphone que vous avez déjà, avec la connexion dont vous disposez vraiment.',
    ctaPrimary: 'Créer un compte parent',
    ctaSecondary: 'J’ai déjà un compte',
    ctaNote: 'La création est gratuite. Vous ne payez qu’au moment de choisir une formule.',

    recordTitle: 'Fiche de vérification',
    recordTeacher: 'Grace Ndifor',
    recordSubjects: 'Mathématiques · de la 1ʳᵉ à la 5ᵉ année',
    recordCheck1: 'La pièce d’identité correspond au candidat',
    recordCheck2: 'Le diplôme est authentique et lisible',
    recordCheck3: 'L’établissement délivrant le diplôme est reconnu',
    recordCheck4: 'Les matières correspondent au diplôme',
    recordCheck5: 'Le nom du portefeuille correspond à la pièce d’identité',
    recordFooter:
      'Approuvée par un administrateur. Chaque point consigne qui l’a vérifié.',

    proofVerified: 'Chaque diplôme vérifié par une personne',
    proofVerifiedHint: 'Pas un formulaire automatique. Un administrateur lit le document.',
    proofBandwidth: 'Fonctionne à 400 kbps',
    proofBandwidthHint: 'Les cours tiennent sur un signal 3G faible.',
    proofPayment: 'MTN MoMo et Orange Money',
    proofPaymentHint: 'Payez comme vous payez déjà tout le reste.',

    howTitle: 'Comment ça marche',
    howLead: 'Trois étapes. C’est notre équipe qui installe tout, pas vous.',
    how1Title: 'Parlez-nous de votre élève',
    how1Body:
      'Son nom, sa classe et les matières dont il a besoin. Notre équipe crée le compte et le rattache au vôtre. Ainsi personne d’autre que nous ne peut inscrire un enfant sur la plateforme.',
    how2Title: 'Nous trouvons un enseignant vérifié',
    how2Body:
      'Quelqu’un qui enseigne cette matière, dans cette classe, et dont nous avons déjà contrôlé le diplôme à la main.',
    how3Title: 'Les cours se passent dans l’application',
    how3Body:
      'Vidéo en direct et tableau blanc partagé. Les devoirs partent, les copies corrigées reviennent, et vous voyez tout.',

    levelsTitle: 'Du Cours 1 à la Terminale',
    levelsLead:
      'Nous suivons la structure scolaire camerounaise, préparation au GCE niveau Ordinaire et Avancé comprise.',
    levelsPrimary: 'École primaire',
    levelsPrimaryList: 'Cours 1 · Cours 2 · Cours 3 · Cours 4 · Cours 5 · Cours 6',
    levelsSecondary: 'École secondaire',
    levelsSecondaryList: '1ʳᵉ · 2ᵉ · 3ᵉ · 4ᵉ · 5ᵉ année · Première · Terminale',
    levelsExam: 'Préparation aux examens',
    levelsExamList: 'GCE niveau Ordinaire · GCE niveau Avancé · GCE adultes',
    subjectsTitle: 'Matières',
    subjectsList:
      'Mathématiques · Mathématiques approfondies · Anglais · Français · Littérature anglaise · Physique · Chimie · Biologie · Informatique · Géographie · Histoire · Économie · Commerce · Comptabilité · Éducation à la citoyenneté · Éducation religieuse',

    safetyTitle: 'Ce que nous faisons avant qu’un enseignant rencontre votre enfant',
    safetyLead:
      'C’est le point sur lequel nous sommes les plus stricts, et celui que la plupart des plateformes négligent.',
    safety1: 'Un administrateur lit la pièce d’identité et le diplôme, confirme l’établissement qui l’a délivré, et consigne ses constats. Un enseignant qui échoue à l’une de ces vérifications ne peut recevoir aucun apprenant.',
    safety2: 'Tous les échanges restent dans ClassConnect. Les numéros personnels, adresses e-mail et pseudos ne sont jamais communiqués, dans aucun sens, et l’application les retire automatiquement des messages.',
    safety3: 'Les cours individuels avec des enfants sont enregistrés par défaut, et tout le monde en est informé : à la réservation, puis de nouveau à la connexion.',
    safety4: 'Vous pouvez ouvrir chaque message, chaque enregistrement, chaque retour et chaque note concernant votre enfant. Un bouton « signaler un problème » est présent sur chaque cours et chaque conversation.',

    connectionTitle: 'Conçu pour la connexion que vous avez',
    connectionLead:
      'La plupart des plateformes supposent la fibre. Celle-ci suppose un téléphone partagé, un après-midi difficile.',
    connection1: 'Quand le signal faiblit, la qualité vidéo baisse d’abord. Puis la caméra de l’élève se coupe, puis celle de l’enseignant. Le son, le tableau blanc et la discussion continuent de fonctionner.',
    connection2: 'Un mode audio seul, activable avant ou pendant le cours, autour de 40 kbps.',
    connection3: 'Votre emploi du temps, vos documents enregistrés et vos devoirs corrigés restent consultables sans aucun réseau.',
    connection4: 'Si vous êtes déconnecté, vous revenez là où vous en étiez, tableau blanc et discussion intacts.',

    pricingTitle: 'Les tarifs',
    pricingLead: 'Un abonnement par apprenant. Résiliable quand vous le souhaitez.',
    pricingMonthly: 'par mois',
    pricingYearly: 'par an',
    pricingPrimary: 'Primaire',
    pricingSecondary: 'Secondaire',
    pricingExam: 'Classes d’examen',
    pricingScience: 'Classes scientifiques',
    pricingNote:
      'Payez avec MTN Mobile Money, Orange Money, Visa ou Mastercard. Chaque paiement donne lieu à un reçu numéroté téléchargeable.',

    faqTitle: 'Les questions des parents',
    faq1Q: 'Puis-je créer moi-même le compte de mon enfant ?',
    faq1A: 'Non, et c’est voulu. Seule l’équipe ClassConnect crée les comptes élèves. Cela garantit que chaque apprenant est passé par nous, pour la même raison que nous vérifions chaque enseignant à la main. Contactez-nous avec le nom et la classe de votre enfant : nous créons le compte et le rattachons au vôtre.',
    faq2Q: 'Et si un cours se passe mal ?',
    faq2A: 'Dites-le-nous. Vous pouvez noter chaque cours et signaler un problème depuis n’importe quel cours ou message. Nous suspendons un enseignant quand il le faut : cela annule ses cours à venir, prévient les familles concernées et gèle ses paiements le temps de l’examen du dossier.',
    faq3Q: 'Garantissez-vous les résultats au GCE ?',
    faq3A: 'Non. Personne ne peut honnêtement le garantir. Nous sommes un service de préparation, pas un organisme d’examen, et nous n’avons aucun lien avec le GCE Board. Ce que nous offrons : des annales, des examens blancs chronométrés, des copies corrigées et une image honnête du niveau de votre enfant.',
    faq4Q: 'Quelles langues ?',
    faq4A: 'L’anglais et le français, tous les deux complets : les cours, l’application, les reçus, les messages et notre assistance. Changez à tout moment, depuis n’importe quel écran.',

    finalTitle: 'Commencez par une seule matière',
    finalBody:
      'Créez votre compte parent, indiquez-nous la classe de votre enfant, et nous nous occupons du reste.',
  },

  nav: {
    home: 'Accueil',
    timetable: 'Emploi du temps',
    homework: 'Devoirs',
    progress: 'Progrès',
    help: 'Aide',
    children: 'Mes enfants',
    students: 'Mes élèves',
    verification: 'Vérification',
    people: 'Personnes',
    money: 'Finances',
  },

  auth: {
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
    signInSubtitle: 'Bon retour. Connectez-vous pour continuer.',
    chooseRole: 'Comment allez-vous utiliser ClassConnect ?',
    roleParent: 'Je suis un parent',
    roleParentHint: 'Inscrivez et payez les cours de votre enfant, et suivez ses progrès.',
    roleAdultLearner: 'J’étudie moi-même',
    roleAdultLearnerHint: 'Vous avez 18 ans ou plus et gérez votre propre compte.',
    roleTeacher: 'Je veux enseigner',
    roleTeacherHint: 'Postulez pour enseigner. Nous vérifions chaque enseignant avant son premier cours.',
    teacherVerificationNote:
      'Après votre inscription, envoyez votre diplôme et votre pièce d’identité. Un administrateur les vérifie à la main, et des apprenants peuvent vous être confiés une fois cela fait.',
    fullName: 'Nom complet',
    phone: 'Numéro de téléphone',
    phoneHint: 'Nous envoyons votre code par SMS. Utilisez le numéro de ce téléphone.',
    phoneOrEmail: 'Numéro de téléphone ou e-mail',
    phoneOrEmailHint: 'Celui avec lequel vous vous êtes inscrit.',
    useCodeInstead: 'Se connecter plutôt avec un code',
    usePasswordInstead: 'Se connecter plutôt avec un mot de passe',
    setPassword: 'Choisir un mot de passe',
    setPasswordHint: 'Facultatif, mais cela permet de se connecter sans attendre un SMS.',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    passwordHint: 'Au moins 10 caractères. Une phrase courte convient bien.',
    dob: 'Date de naissance',
    sendCode: 'Envoyez-moi un code',
    enterCode: 'Saisissez votre code',
    codeSentTo: 'Nous avons envoyé un code à 6 chiffres au {destination}.',
    codeExpiresIn: 'Le code expire dans {minutes} minutes.',
    resendCode: 'Envoyer un nouveau code',
    resendIn: 'Vous pourrez demander un nouveau code dans {seconds} s',
    tryWhatsApp: 'Envoyer plutôt le code sur WhatsApp',
    verify: 'Vérifier',
    acceptTerms: 'J’accepte les Conditions d’utilisation et la Politique de confidentialité.',
    readTerms: 'Lire les conditions',
    readPrivacy: 'Lire la politique de confidentialité',
    forgotPassword: 'Mot de passe oublié ?',
    mfaCode: 'Code d’authentification',
    mfaHint: 'Les comptes du personnel exigent une seconde étape. Saisissez le code à 6 chiffres de votre application.',
    activeSessions: 'Où vous êtes connecté',
    signOutAll: 'Se déconnecter de tous les appareils',
    revokeSession: 'Déconnecter cet appareil',
    lastActive: 'Dernière activité {when}',
  },

  family: {
    myChildren: 'Mes enfants',
    addChild: 'Ajouter un enfant',
    addChildIntro: 'Parlez-nous de votre enfant afin que nous trouvions le bon enseignant.',
    childName: 'Nom de l’enfant',
    childDob: 'Date de naissance',
    level: 'Classe ou niveau',
    subjects: 'Matières',
    preferredLanguage: 'Langue des cours',
    preferredLanguageHint: 'La langue dans laquelle cet élève est enseigné.',
    switchChild: 'Changer d’enfant',
    noChildrenTitle: 'Aucun enfant rattaché',
    noChildrenBody:
      'L’équipe ClassConnect crée les comptes élèves et les rattache à vous. Contactez l’assistance avec le nom et la classe de votre enfant, et ils apparaîtront ici.',
    grantSignIn: 'Donner à cet enfant son propre accès',
    revokeSignIn: 'Retirer son accès',
    inviteGuardian: 'Inviter un autre parent ou tuteur',
    accessFull: 'Peut gérer et payer',
    accessViewOnly: 'Peut seulement consulter',
    archiveChild: 'Archiver ce profil',
    archiveBlocked:
      'Ce profil ne peut pas être supprimé tant qu’un abonnement, un solde ou un litige est ouvert. Vous pouvez l’archiver.',
    turns18Title: '{name} aura bientôt 18 ans',
    turns18Body:
      'À 18 ans, {name} peut avoir son propre compte. Vous pouvez le transférer à tout moment.',
  },

  teacher: {
    myAccount: 'Mon compte enseignant',
    detailsManagedByAdmin:
      'Ces informations ont été enregistrées par l’équipe ClassConnect. Contactez l’assistance en cas d’erreur.',
    application: 'Candidature d’enseignant',
    applicationIntro:
      'Nous vérifions chaque enseignant avant son premier cours. Cela protège les apprenants et vous protège aussi.',
    qualification: 'Diplôme le plus élevé',
    institution: 'Établissement fréquenté',
    year: 'Année d’obtention',
    experience: 'Années d’expérience',
    subjectsTaught: 'Matières et niveaux enseignés',
    teachingLanguages: 'Langues dans lesquelles vous enseignez',
    teachingLanguagesHint:
      'Choisissez toutes les langues dans lesquelles vous pouvez enseigner. Les familles filtrent les enseignants sur ce critère.',
    identityDocument: 'Pièce d’identité',
    documents: 'Pièces justificatives',
    documentsHint:
      'Certificats, diplômes, pièce d’identité ou autorisation d’enseigner. PDF, JPG, PNG ou HEIC, 10 Mo maximum par fichier.',
    chooseFile: 'Choisir un fichier',
    documentExpiry: 'Date d’expiration',
    uploading: 'Envoi en cours… {percent} %',
    documentPendingScan:
      'Nous vérifions la sécurité de ce fichier. Il ne peut pas encore être ouvert.',
    documentQuarantined:
      'Ce fichier n’a pas passé le contrôle de sécurité et a été supprimé.',
    documentType: {
      national_id: 'Carte nationale d’identité',
      passport: 'Passeport',
      degree_certificate: 'Diplôme universitaire',
      diploma: 'Diplôme',
      teaching_authorisation: 'Autorisation d’enseigner',
      other: 'Autre document',
    },
    payoutDetails: 'Où nous envoyons vos gains',
    payoutHint:
      'Seule notre équipe financière voit ces informations. Les apprenants et les parents ne les voient jamais.',
    submitApplication: 'Soumettre la candidature',
    statusDraft: 'Brouillon',
    statusSubmitted: 'Soumise',
    statusUnderReview: 'En cours d’examen',
    statusApproved: 'Approuvée',
    statusRejected: 'Non approuvée',
    statusMoreInfo: 'Informations complémentaires requises',
    statusDraftHint: 'Terminez et soumettez votre candidature quand vous êtes prêt.',
    statusSubmittedHint:
      'Nous avons votre candidature. Nous répondons généralement sous quelques jours ouvrables.',
    statusUnderReviewHint: 'Un administrateur vérifie vos documents en ce moment.',
    statusApprovedHint: 'Vous êtes vérifié. Des apprenants peuvent vous être attribués.',
    statusMoreInfoHint:
      'Il nous manque un élément pour conclure. Voir la note ci-dessous.',
    codeOfConduct: 'Code de conduite',
    safeguardingPolicy: 'Politique de protection des mineurs',
    commercialTerms: 'Conditions commerciales',
    acceptBeforeFirstAssignment: 'Veuillez les accepter avant votre première attribution.',
  },

  admin: {
    verificationQueue: 'Vérification des enseignants',
    queueEmpty: 'Aucune candidature en attente. Les nouvelles soumissions apparaissent ici.',
    applicant: 'Candidat',
    submitted: 'Soumise le',
    waiting: 'En attente depuis {days} jours',
    checklist: 'Liste de vérification',
    checklistHint:
      'Confirmez chaque point vous-même. Chaque point enregistre qui l’a vérifié et quand.',
    checkIdentity: 'La pièce d’identité correspond au candidat',
    checkQualification: 'Le diplôme est authentique et lisible',
    checkInstitution: 'L’établissement délivrant le diplôme est reconnu',
    checkSubjects: 'Les matières et niveaux correspondent au diplôme',
    checkAuthorisation: 'L’autorisation d’enseigner, si requise, est présente et valide',
    checkPayout: 'Le nom du portefeuille de paiement correspond à l’identité du candidat',
    findings: 'Vos constats',
    approve: 'Approuver',
    reject: 'Rejeter',
    requestMoreInfo: 'Demander des informations',
    decisionReason: 'Motif (envoyé au candidat)',
    approveBlocked: 'Confirmez chaque point de la liste avant d’approuver.',
    // Comptes créés par l’administrateur
    students: 'Élèves',
    teachers: 'Enseignants',
    newStudent: 'Ajouter un élève',
    newTeacher: 'Ajouter un enseignant',
    createStudent: 'Créer le compte élève',
    createTeacher: 'Créer le compte enseignant',
    newStudentIntro:
      'Seul un administrateur peut créer un compte élève. Choisissez l’école, la classe et les matières que l’élève suivra.',
    newTeacherIntro:
      'Seul un administrateur peut créer un compte enseignant. Choisissez l’école et les matières enseignées, puis confirmez ses diplômes ci-dessous.',
    schoolType: 'Quelle école ?',
    schoolPrimary: 'École primaire',
    schoolPrimaryHint: 'Du Cours 1 au Cours 6.',
    schoolSecondary: 'École secondaire',
    schoolSecondaryHint: 'De la 1ʳᵉ à la 5ᵉ année, Première et Terminale.',
    allSchools: 'Toutes',
    chooseClass: 'Choisir la classe',
    chooseSubjects: 'Matières que cet élève suivra',
    chooseSubjectsHint: 'Seules les matières enseignées dans la classe choisie sont proposées.',
    chooseTeachingSubjects: 'Matières que cet enseignant enseignera',
    chooseTeachingSubjectsHint:
      'Choisissez une classe, puis les matières. Répétez pour chaque classe enseignée.',
    subjectsSelected: '{count} sélectionnée(s)',
    guardianPhone: 'Numéro du parent',
    guardianPhoneHint:
      'Rattache cet élève à un parent qui a déjà un compte. Laissez vide pour le rattacher plus tard.',
    giveOwnSignIn: 'Donner à cet élève son propre accès',
    giveOwnSignInHint: 'Vous pouvez l’ajouter ou le retirer à tout moment.',
    teacherPhoneHint: 'L’enseignant se connecte avec ce numéro.',
    teacherPasswordHint:
      'Remettez-le à l’enseignant. Il pourra le changer après sa connexion.',
    payoutWallet: 'Numéro mobile money pour les gains',
    willBeApproved:
      'Toutes les vérifications requises sont confirmées. Cet enseignant sera approuvé et pourra recevoir des apprenants.',
    willBeUnderReview:
      'Certaines vérifications ne sont pas confirmées. Le compte sera créé, mais l’enseignant ne pourra être ni listé, ni attribué, ni payé tant qu’elles ne le sont pas.',
    noStudentsTitle: 'Aucun élève pour l’instant',
    noStudentsBody: 'Ajoutez un élève pour choisir sa classe et ses matières.',
    guardianIs: 'Parent : {name}',
    noGuardian: 'Aucun parent rattaché',
    hasOwnSignIn: 'a son propre accès',
    suspend: 'Suspendre l’enseignant',
    suspendWarning:
      'La suspension annule ses séances futures, avertit les apprenants et parents concernés et gèle les paiements.',
    auditTrail: 'Journal d’audit',
  },

  catalogue: {
    levels: 'Niveaux',
    subjects: 'Matières',
    findTeacher: 'Trouver un enseignant',
    verified: 'Vérifié',
    yearsExperience: '{count} ans d’expérience',
    lessonsDelivered: '{count} cours donnés',
    ratingHidden: 'Nouvel enseignant',
    ratingHiddenHint:
      'Nous affichons une note dès qu’un enseignant a au moins {count} avis.',
    noTeachersTitle: 'Aucun enseignant ne correspond pour l’instant',
    noTeachersBody:
      'Essayez de retirer un filtre, ou revenez bientôt. Nous vérifions de nouveaux enseignants chaque semaine.',
  },

  errors: {
    generic: 'Un problème est survenu de notre côté. Veuillez réessayer.',
    network: 'Nous n’avons pas pu joindre ClassConnect. Vérifiez votre connexion et réessayez.',
    timeout:
      'Cela prend plus de temps que prévu. Vérifiez votre connexion et réessayez.',
    unauthorised: 'Veuillez vous connecter pour continuer.',
    forbidden: 'Vous n’avez pas accès à ceci.',
    notFound: 'Nous n’avons pas trouvé cet élément.',
    validation: 'Veuillez vérifier les champs signalés.',
    phone: {
      invalid: 'Ce numéro ne semble pas valide. Exemple : 6XX XXX XXX.',
      not_mobile: 'Veuillez utiliser un numéro mobile. Nous devons vous envoyer un SMS.',
      taken: 'Ce numéro a déjà un compte. Essayez de vous connecter.',
    },
    email: { taken: 'Cette adresse a déjà un compte. Essayez de vous connecter.' },
    password: {
      too_short: 'Utilisez au moins 10 caractères. Une phrase courte convient bien.',
      too_long: 'Ce mot de passe est trop long.',
      required_for_email: 'Choisissez un mot de passe pour vous connecter avec votre e-mail.',
      required_for_signin:
        'Définissez un mot de passe pour donner à cet élève son propre accès.',
      incorrect: 'Cet e-mail et ce mot de passe ne correspondent pas.',
    },
    identifier: { required: 'Donnez-nous un numéro de téléphone ou une adresse e-mail.' },
    language: { required: 'Choisissez au moins une langue.' },
    terms: { required: 'Veuillez accepter les conditions pour continuer.' },
    dob: {
      required: 'Veuillez indiquer votre date de naissance.',
      adult_required:
        'Vous devez avoir 18 ans ou plus pour avoir votre propre compte. Un parent peut créer le vôtre.',
      future: 'Cette date est dans le futur.',
    },
    otp: {
      format: 'Saisissez les 6 chiffres que nous vous avons envoyés.',
      incorrect: 'Ce code est incorrect. Il vous reste {remaining} essais.',
      expired: 'Ce code a expiré. Demandez-en un nouveau.',
      too_many: 'Trop d’essais. Demandez un nouveau code.',
      rate_limited:
        'Vous avez demandé plusieurs codes. Patientez {minutes} minutes puis réessayez.',
      daily_limit:
        'Vous avez atteint la limite de codes pour aujourd’hui. Réessayez demain ou contactez l’assistance.',
    },
    account: {
      locked:
        'Votre compte est verrouillé pendant {minutes} minutes après trop de tentatives. Nous avons prévenu le titulaire.',
      suspended: 'Ce compte est suspendu. Veuillez contacter l’assistance.',
    },
    mfa: {
      required: 'Saisissez votre code d’authentification.',
      incorrect: 'Ce code d’authentification est incorrect.',
      not_started: 'Configurez d’abord votre application d’authentification.',
    },
    teacher: {
      subjects_required: 'Choisissez au moins une matière et un niveau.',
      not_approved: 'Seuls les enseignants approuvés peuvent recevoir des apprenants.',
      already_applied: 'Vous avez déjà une candidature en cours.',
      application_closed: 'Cette candidature est close.',
    },
    student: {
      subjects_required: 'Choisissez au moins une matière pour cet élève.',
    },
    level: {
      not_found: 'Veuillez choisir une classe.',
      wrong_school_type: 'Cette classe n’appartient pas à l’école que vous avez choisie.',
    },
    subject: {
      not_at_level:
        '{count} des matières choisies ne sont pas enseignées dans cette classe.',
    },
    verification: {
      reason_required: 'Indiquez un motif. Nous l’envoyons au candidat.',
      already_decided: 'Cette candidature a déjà été traitée.',
      checklist_incomplete:
        'Confirmez chaque point avant d’approuver. Restent à confirmer : {missing}.',
    },
    learner: {
      archive_blocked:
        'Ce profil a un abonnement, un solde ou un litige en cours. Archivez-le plutôt.',
      not_yours: 'Vous ne pouvez gérer que les enfants liés à votre compte.',
      credentials_exist: 'Cet enfant possède déjà son propre accès.',
    },
    guardian: {
      invitee_not_found:
        'Cette personne n’a pas encore de compte ClassConnect. Demandez-lui de s’inscrire, puis invitez-la.',
      not_a_parent: 'Ce compte n’est pas un compte parent.',
    },
    impersonation: {
      read_only: 'Vous consultez le compte d’un autre utilisateur. Cette vue est en lecture seule.',
    },
    file: {
      no_extension:
        'Ce fichier n’a pas de type. Veuillez le renommer, par exemple en « .pdf ».',
      empty: 'Ce fichier est vide. Veuillez en choisir un autre.',
      too_large: 'Ce fichier dépasse {maxMb} Mo. Veuillez utiliser un fichier plus petit.',
      type_blocked: 'Nous n’acceptons pas les fichiers « .{extension} » pour des raisons de sécurité.',
      type_not_allowed: 'Veuillez utiliser l’un de ces types de fichiers : {allowed}.',
      upload_not_found: 'Nous n’avons pas reçu ce fichier. Veuillez réessayer de l’envoyer.',
      rejected: 'Nous n’avons pas pu accepter ce fichier. Veuillez réessayer de l’envoyer.',
      quarantined:
        'Ce fichier n’a pas passé notre contrôle de sécurité et a été supprimé. Analysez votre appareil et essayez un autre fichier.',
      not_available:
        'Ce fichier n’est pas encore consultable. Nous vérifions la sécurité de chaque fichier avant son ouverture.',
    },
  },

  notifications: {
    otp: {
      body: 'Votre code ClassConnect est {code}. Il expire dans {minutes} minutes. Ne le partagez pas.',
    },
    welcome: {
      subject: 'Bienvenue sur ClassConnect',
      body: 'Bonjour {name}, votre compte ClassConnect est prêt.',
    },
    teacherApplicationSubmitted: {
      subject: 'Nous avons reçu votre candidature',
      body: 'Bonjour {name}, nous avons votre candidature et l’examinerons sous peu.',
    },
    teacherApproved: {
      subject: 'Vous êtes vérifié',
      body: 'Bonjour {name}, votre candidature est approuvée. Des apprenants peuvent vous être attribués.',
    },
    teacherRejected: {
      subject: 'À propos de votre candidature',
      body: 'Bonjour {name}, nous n’avons pas pu approuver votre candidature. Motif : {reason}. Vous pouvez postuler à nouveau.',
    },
    teacherMoreInfo: {
      subject: 'Il nous manque un élément',
      body: 'Bonjour {name}, il nous faut plus d’informations avant de conclure : {reason}.',
    },
    teacherSuspended: {
      subject: 'Votre compte est suspendu',
      body: 'Bonjour {name}, votre compte enseignant est suspendu en attente d’examen. Motif : {reason}.',
    },
    accountLocked: {
      subject: 'Tentatives de connexion sur votre compte',
      body: 'Nous avons verrouillé votre compte pendant {minutes} minutes après plusieurs échecs de connexion. Si ce n’était pas vous, contactez l’assistance.',
    },
  },
};
