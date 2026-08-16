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
    delete: 'Retirer',
    actions: 'Actions',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    /** Pour un formulaire que l'on soumet, et non que l'on enregistre. */
    sending: 'Envoi…',
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
    /* Le retour vers votre propre espace depuis une page publique. */
    myDashboard: 'Mon tableau de bord',
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
    home: {
      title: 'Bienvenue, {name}',
      description: 'Votre enseignement en un coup d’œil.',
      classes: 'Classes que vous enseignez',
      learners: 'Élèves que vous enseignez',
      viewClasses: 'Voir les classes',
      /* FR-HWK-008 : le seul chiffre ici qui demande une action. */
      awaitingMarking: 'En attente de correction',
      goMark: 'Aller corriger',
    },
    /** La barre de progression — mesurée sur l’emploi du temps confirmé. */
    progress: {
      title: 'Votre semaine',
      hours: '{taught} heures sur {timetabled}',
      percent: '{percent} % de votre semaine planifiée',
      extra: 'Plus {hours} heures enseignées hors emploi du temps.',
      /* Voir en.ts : 0 % se lirait comme un reproche, pas comme un état. */
      noTimetable:
        'Vous n’avez aucune heure confirmée cette semaine. Proposez-en depuis votre emploi du temps.',
      awaitingConfirmation:
        '{count} heures attendent la confirmation d’un admin. Votre semaine commence à compter à ce moment-là.',
      rating: 'Noté {average} sur 5 par {count} élèves.',
      ratingPending:
        '{count} note(s) sur {needed}. Nous affichons une moyenne dès qu’elle a un sens.',
    },
    /** La salle d’attente, tant qu’un admin n’a pas approuvé la candidature. */
    profile: {
      description: 'Ce que nous avons sur vous, et ce qu’un admin a vérifié.',
      account: 'Votre compte',
      teaching: 'Votre dossier d’enseignement',
      verified: 'Vérifié',
      unverified: 'Pas encore vérifié',
      changeHint: 'Pour modifier ces informations, ouvrez',
    },
    /** FR-ERN-006 : la vue du professeur sur ses propres gains. */
    earnings: {
      description: 'Ce que vous avez gagné, par mois.',
      net: 'Net à payer',
      gross: 'Brut',
      deductions: 'Retenues',
      awaiting: 'En attente de paiement',
      taught: 'Temps enseigné',
      period: 'Mois',
      state: 'État',
      paid: 'Dans un versement',
      pending: 'Pas encore payé',
      /* Voir en.ts : un autre type de chiffre que les tuiles ci-dessus. */
      accrualTitle: 'Enseignement à ce jour — indicatif',
      rate: 'À {rate} XAF l’heure, fixé par l’admin',
      accrualHint:
        'Les cours donnés dans un créneau confirmé de votre emploi du temps, valorisés au tarif actuel. Un cours de moins de {minutes} minutes ne compte pas. Ce que vous percevez réellement est calculé en fin de mois, à partir des chiffres ci-dessus.',
      window: { today: 'Aujourd’hui', thisWeek: 'Cette semaine', thisMonth: 'Ce mois' },
      belowFloor:
        '{count} cours ce mois-ci ont duré moins de {minutes} minutes : ils ne sont pas comptés ici.',
      emptyTitle: 'Rien de gagné pour l’instant',
      emptyBody:
        'Dès que vous aurez donné des cours, ce que vous gagnez apparaîtra ici chaque mois.',
      footnote:
        '« Dans un versement » signifie que le montant est approuvé pour paiement, et non qu’il est arrivé. Les paiements sont envoyés au numéro mobile money de votre profil une fois confirmé par la finance.',
    },
    locked: {
      title: 'Terminez votre vérification',
      description:
        'Vos outils d’enseignement s’ouvrent une fois votre identité vérifiée.',
      action: 'Aller à la vérification',
      status: {
        draft:
          'Votre candidature n’est pas terminée. Ajoutez vos informations et vos documents, puis envoyez-la pour approbation.',
        submitted:
          'Votre candidature est entre les mains de notre équipe. Nous vous préviendrons dès qu’elle aura été examinée — vous n’avez rien à faire.',
        under_review:
          'Quelqu’un examine votre candidature en ce moment. Nous vous préviendrons dès qu’une décision sera prise.',
        more_info_required:
          'Il nous manque quelque chose avant de pouvoir vous approuver. Ouvrez votre vérification pour voir ce qui manque.',
        rejected:
          'Votre candidature n’a pas été approuvée. Ouvrez votre vérification pour en connaître la raison.',
        approved: 'Vous êtes approuvé.',
      },
    },
    classes: {
      title: 'Classes',
      description: 'Choisissez un groupe pour voir les classes que vous y enseignez.',
      bandEmpty: 'Vous n’enseignez encore aucune classe dans ce groupe.',
      learnerCount: '{count} élèves',
      band: {
        primary: 'Primaire (Class One à Class Six)',
        secondary: 'Secondaire (Form One à Form Five)',
        sixth_form: 'Lower et Upper Sixth',
        private: 'Cours particuliers',
      },
      column: {
        name: 'Classe',
        level: 'Niveau',
        subject: 'Matière',
        students: 'Élèves',
      },
    },
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
      intro_video: 'Vidéo de présentation',
      other: 'Autre document',
    },
    payoutDetails: 'Où nous envoyons vos gains',
    payoutHint:
      'Seule notre équipe financière voit ces informations. Les apprenants et les parents ne les voient jamais.',
    /* Nous avons le numéro mais ne pouvons pas l’afficher — voir le champ. */
    payoutOnFile:
      'Nous avons {number} en mémoire. Il est chiffré, nous ne pouvons donc pas l’afficher en entier — retapez-le pour confirmer, ou saisissez un autre numéro.',
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
    /** Les fichiers du candidat, là où la décision se prend. Voir en.ts. */
    review: {
      documents: 'Ce que le candidat a envoyé',
      openDocument: 'Ouvrir',
      removeDocument: 'Retirer',
      /** « Retirer de la file » et non « supprimer » : le dossier est conservé. Voir en.ts. */
      removeFromQueue: 'Retirer de la file',
      removeFromQueueConfirm: 'Retirer {name} de la file ?',
      removeFromQueueHint:
        'La candidature est close comme non approuvée et disparaît de cette liste. Le dossier est conservé et le candidat est informé du motif.',
      removeFromQueueReason: 'Motif — le candidat le verra',
      removeFromQueueAction: 'Retirer',
      removeConfirm: 'Retirer « {fileName} » ? Le fichier sera supprimé définitivement.',
      removeReason: 'Pourquoi le retirez-vous ? Le candidat en sera informé.',
      removeConfirmAction: 'Retirer',
      watchIntro: 'La vidéo de présentation du candidat',
      noDocuments:
        'Ce candidat n’a encore envoyé aucun document. Il n’y a rien à vérifier ici — demandez ce qu’il vous faut plutôt que d’approuver.',
    },
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

  schoolType: {
    primary: 'École primaire',
    primaryHint: 'Du Cours 1 au Cours 6.',
    secondary: 'École secondaire',
    secondaryHint: 'De la 1ʳᵉ à la 5ᵉ année, et le GCE niveau Ordinaire.',
    sixthForm: 'Première et Terminale',
    sixthFormHint: 'Première et Terminale, et l’enseignement du GCE niveau Avancé.',
    all: 'Tous les cycles',
    unclassified: 'Non classé',
  },

  teachers: {
    title: 'Enseignants',
    band: 'Enseigne en',
    classify: 'Changer de cycle',
    classified: 'Enseignant reclassé',
    classifyTitle: 'Placer {name} dans un autre cycle',
    classifyBody:
      'Cela détermine quels apprenants peuvent être affectés à {name}. Les matières déjà enregistrées ne changent pas.',
    classifyMismatch:
      '{count} de ses matières sont enseignées à des niveaux hors de ce cycle. Elles restent au dossier et devront être revues.',
    unclassifiedBanner:
      '{count} enseignants n’ont pas de cycle. Aucun apprenant ne peut leur être affecté tant qu’il n’est pas choisi.',
    subjectsTaught: 'Matières enseignées',
    noSubjects: 'Aucune matière enregistrée',
    hoursTaught: 'Heures enseignées',
    hoursThisMonth: 'Ce mois-ci',
    hoursAllTime: 'Depuis le début',
    sessionsDelivered: 'Cours assurés',
    learnersTaught: 'Apprenants suivis',
    perSubject: 'Par matière',
    noHours: 'Aucun cours assuré pour l’instant',
    verification: 'Vérification',
    emptyTitle: 'Aucun enseignant dans ce cycle',
    emptyBody: 'Changez le filtre, ou ajoutez un enseignant.',
    viewDetail: 'Ouvrir',
    hoursExplain:
      'Les heures proviennent des connexions et déconnexions enregistrées par le serveur média, jamais de la déclaration de l’enseignant.',
  },


  schedule: {
    title: 'Emplois du temps',
    subtitle: 'La semaine à venir, par cycle ou par cours particulier.',
    private: 'Cours particuliers',
    privateHint: 'Cours en tête-à-tête, tous cycles confondus.',
    thisWeek: 'Cette semaine',
    previousWeek: 'Semaine précédente',
    nextWeek: 'Semaine suivante',
    weekOf: 'Semaine du {date}',
    today: 'Aujourd’hui',
    emptyTitle: 'Rien de programmé',
    emptyBody: 'Aucun cours n’est réservé pour ce groupe cette semaine. Essayez une autre semaine, ou un autre groupe.',
    noLessons: 'Aucun cours',
    totalSessions: '{count} cours',
    totalTeachers: '{count} enseignants',
    cancelled: 'Annulé',
    liveNow: 'En direct',
    slotTeacher: 'Enseignant',
    slotDetail: 'Détail du cours',
    nowTeaching: 'En cours d’enseignement',
    nowTeachingNone: 'N’est pas en cours actuellement',
    nowTeachingThis: 'C’est le cours qu’il assure en ce moment.',
    runningFor: 'En cours depuis {duration}',
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
  },
    live: {
    title: 'Cours en direct',
    subtitle: 'Tous les cours en cours en ce moment.',
    /** La position de l’enseignant dans la période, calculée côté serveur. */
    countdown: {
      taught: '{minutes} min enseignées',
      earned: '{amount} FCFA',
      remaining: 'Il reste {minutes} min dans cette période',
      periodOver: 'Cette période est terminée. Plus rien n’est gagné.',
      completed: 'Au-delà des {minutes} minutes — cette période compte.',
      notYet: 'Cette période comptera après {minutes} minutes d’enseignement.',
      noEarnings:
        'Ceci est un appel sur invitation, pas un cours de l’emploi du temps. Il ne rapporte rien.',
    },
    /** La salle : vignettes, commandes, et quoi dire quand le média échoue. */
    room: {
      connecting: 'Connexion à la salle…',
      reconnecting: 'Connexion perdue. Tentative de reconnexion…',
      noVideo: 'Personne n’a encore activé sa caméra.',
      you: 'Vous',
      muteMic: 'Couper le micro',
      unmuteMic: 'Activer le micro',
      cameraOff: 'Couper la caméra',
      cameraOn: 'Activer la caméra',
      endCall: 'Terminer l’appel',
      leaveCall: 'Quitter l’appel',
      retry: 'Réessayer',
      /* Indique le remède : « permission refusée » seul n’aide personne. */
      permissionDenied:
        'Votre navigateur a bloqué la caméra et le micro. Autorisez-les dans la barre d’adresse, puis rechargez — vous pouvez rester dans le cours entre-temps.',
      noCamera:
        'Aucune caméra détectée sur cet appareil. Vous avez rejoint en audio seulement, ce qui suffit pour participer.',
      /* Désigne le réseau, pas la caméra : accuser le mauvais responsable fait perdre le cours. */
      videoBlocked:
        'Votre caméra fonctionne, mais ce réseau ne laisse pas passer la vidéo. Le cours continue en audio. Sur un autre réseau, ou sans VPN, l’image devrait apparaître.',
      connectFailed: 'Nous n’avons pas pu vous connecter à la salle.',
      /* Affiché seulement si le navigateur retient réellement le son. */
      enableSound: 'Appuyez pour entendre tout le monde',
      /* Désigne le bouclier, pas l’invite caméra : aucune invite n’est apparue. */
      /* Politique du navigateur : aucun réglage de cette page n’y change rien. */
      insecureTitle: 'Cette adresse ne peut pas utiliser la caméra',
      insecureBody:
        'Les navigateurs n’autorisent la caméra qu’en https:// ou sur localhost. Ouvrez le site sur localhost, ou en https, et la caméra fonctionnera. Vous pouvez tout de même regarder et écouter ici.',
      unsupported:
        'Ce navigateur ne prend pas en charge la vidéo en direct. Chrome, Edge, Firefox ou Safari à jour le font tous.',
      blockedTitle: 'Votre navigateur a bloqué la connexion vidéo',
      blockedBody:
        'Il s’agit d’une protection du navigateur, pas d’une permission que vous auriez refusée. Dans Firefox, cliquez sur le bouclier dans la barre d’adresse et désactivez la protection renforcée pour ce site. Si vous utilisez un bloqueur de publicités, autorisez aussi ce site, puis rechargez.',
    },
    /** Inviter quelqu’un à un appel, par son nom. */
    invite: {
      title: 'Inviter quelqu’un',
      hint: 'Seules les personnes que vous invitez peuvent rejoindre cet appel, même avec le lien.',
      searchPlaceholder: 'Tapez un nom',
      typeMore: 'Tapez au moins deux lettres d’un nom.',
      noMatches: 'Personne ne correspond à ce nom.',
      add: 'Inviter',
      remove: 'Retirer',
      roleTeacher: 'Enseignant',
      roleStudent: 'Élève',
    },
    emptyTitle: 'Aucun cours en cours',
    emptyBody: 'Les cours apparaissent ici dès qu’un enseignant en démarre un.',
    teacher: 'Enseignant',
    subject: 'Matière',
    kind: 'Type',
    private: 'Cours particulier',
    privateHint: 'En tête-à-tête, avec un seul apprenant.',
    group: 'Cours collectif',
    attending: 'Participants',
    attendingCount: '{count} participants',
    nobodyJoined: 'Personne n’a encore rejoint',
    startedAt: 'Commencé à',
    runningFor: 'En cours depuis {duration}',
    scheduledFor: 'Prévu pour {duration}',
    overrunning: 'Dépassement de {duration}',
    recording: 'Enregistrement',
    recordingOn: 'Enregistré',
    recordingOff: 'Non enregistré',
    level: 'Niveau',
    startingSoon: 'Débute bientôt',
    startsIn: 'Débute dans {duration}',
    watchNote:
      'Ouvrir cette liste enregistre qui a regardé, et quand. Chaque participant est informé que le personnel peut consulter le cours.',
    liveNow: '{count} en direct',
    newClassStarted: '{teacher} a démarré un {kind} — {subject}',
  },

  adminNav: {
    title: 'ClassConnect · Administration',
    collapse: 'Réduire le menu',
    expand: 'Agrandir le menu',
    unavailableTitle: 'Le menu n’a pas pu être chargé',
    unavailableBody:
      'Cela ne vient pas de votre compte. Le service d’administration est injoignable ou n’est pas à jour. Prévenez la personne qui gère la plateforme et indiquez la référence ci-dessous.',
    group: {
      approvals: 'Validations',
      people: 'Personnes',
      operations: 'Opérations',
      money: 'Finances',
    },
    sectionBadgeLabel: '{label} : {count} éléments demandent votre attention',
    sectionCurrentLabel: '{label} : contient la page actuelle',
    sectionBadgeCurrentLabel:
      '{label} : {count} éléments demandent votre attention, contient la page actuelle',
    overview: 'Vue d’ensemble',
    students: 'Élèves',
    primaryStudents: 'Élèves du primaire',
    /* La file des heures proposées, et la vue sur toute l’école. */
    timetable: 'Emplois du temps à valider',
    timetableOverview: 'Emplois du temps',
    teachers: 'Enseignants',
    teacherRoster: 'Tous les enseignants',
    studentRoster: 'Tous les élèves',
    live: 'Cours en direct',
    /* Le nom donné à la fonctionnalité, pas une description de celle-ci. */
    recordings: 'Cours passés — général',
    schedule: 'Emplois du temps',
    support: 'Affecter le service client',
    messages: 'Messages',
    safeguarding: 'Protection de l’enfance',
    payments: 'Paiements',
    studentsFees: 'Élèves — frais',
    studentsPaid: 'Élèves — payé',
    studentsOwing: 'Élèves — impayés',
    teachersPaid: 'Enseignants — payés',
    teachersPending: 'Enseignants — en attente',
    hoursEarnings: 'Heures et rémunérations',
    reconciliation: 'Rapprochement',
    accounts: 'Comptes et accès',
    reports: 'Rapports',
    audit: 'Journal d’audit',
    badgeLabel: {
      studentsAwaitingApproval: 'Élèves en attente de validation : {count}',
      primaryAwaitingApproval: 'Élèves du primaire en attente de validation : {count}',
      teachersAwaitingVerification: 'Enseignants en attente de vérification : {count}',
      unassignedTickets: 'Tickets non affectés : {count}',
      safeguardingOpen: 'Signalements de protection ouverts : {count}',
      studentsOwing: 'Élèves en situation d’impayé : {count}',
      teacherPayoutsPending: 'Versements aux enseignants en attente : {count}',
      reconciliationUnmatched: 'Paiements non rapprochés : {count}',
      liveClasses: 'Cours en cours : {count}',
      teachersUnclassified: 'Enseignants sans cycle : {count}',
    },
  },

  overview: {
    title: 'Vue d’ensemble',
    needsYouNow: 'Ce qui vous attend',
    operational: 'Opérations',
    money: 'Finances ce mois-ci',
    alerts: 'Alertes',
    noAlertsTitle: 'Rien ne demande votre attention',
    noAlertsBody:
      'Les alertes sur les paiements, les enseignants et les devoirs non corrigés apparaissent ici.',
    tile: {
      teachersAwaitingVerification: 'Enseignants à vérifier',
      studentsAwaitingApproval: 'Élèves à valider',
      unassignedTickets: 'Tickets non affectés',
      safeguardingOpen: 'Protection de l’enfance — ouverts',
      paymentsPendingReconciliation: 'Paiements à rapprocher',
      autoFrozen24h: 'Comptes gelés depuis 24 heures',
    },
    metric: {
      activeLearners: 'Apprenants actifs',
      activeTeachers: 'Enseignants actifs',
      sessionsScheduled: 'Séances prévues aujourd’hui',
      sessionsDelivered: 'Séances assurées aujourd’hui',
      sessionsCancelled: 'Séances annulées aujourd’hui',
      teacherNoShowRate: 'Taux d’absence des enseignants',
      learnerNoShowRate: 'Taux d’absence des apprenants',
      verificationThroughput: 'Validations cette semaine',
      supportSla: 'Délais du support respectés',
      grossRevenue: 'Chiffre d’affaires brut',
      refunds: 'Remboursements',
      teacherPoolAccrued: 'Enveloppe enseignants constituée',
      payoutsMade: 'Versements effectués',
      payoutsPayable: 'Versements à effectuer',
      unreconciled: 'Éléments non rapprochés',
      churn: 'Résiliations ce mois-ci',
      paymentSuccessRate: 'Taux de réussite des paiements',
    },
    alert: {
      unmatchedAboveThreshold:
        '{count} paiements ne correspondent pas au relevé du prestataire, pour {value}.',
      teacherBelowThreshold: '{name} est passé sous le seuil de note ou de fiabilité.',
      ungradedOverdue: '{count} devoirs attendent une correction depuis plus de {days} jours.',
      providerDegraded: '{provider} répond lentement ou échoue.',
    },
    revenueByPlan: 'Chiffre d’affaires par formule',
    revenueByMethod: 'Réussite des paiements par moyen',
  },

  approvals: {
    studentsTitle: 'Élèves en attente de validation',
    primaryTitle: 'Élèves du primaire en attente de validation',
    teachersTitle: 'Enseignants en attente de vérification',
    emptyStudentsTitle: 'Aucun élève en attente',
    emptyStudentsBody:
      'Les nouveaux comptes élèves apparaissent ici pour validation avant d’être activés.',
    emptyPrimaryBody:
      'Les nouveaux comptes du primaire apparaissent ici. Chacun exige le consentement du parent avant validation.',
    primaryBanner:
      'Il s’agit d’enfants de moins de 12 ans. Vérifiez le consentement du parent avant de valider.',
    learner: 'Apprenant',
    guardian: 'Parent',
    guardianPhone: 'Téléphone du parent',
    level: 'Niveau',
    subjects: 'Matières',
    dob: 'Date de naissance',
    minorStatus: 'Mineur',
    isMinor: 'Moins de 18 ans',
    isAdult: '18 ans ou plus',
    consentRecorded: 'Consentement du parent',
    plan: 'Formule',
    submittedAt: 'Déposé le',
    ageOfRequest: 'En attente',
    ageDays: '{days} jours',
    checks: 'Vérifications obligatoires',
    checkGuardianLinked: 'Le compte parent est lié et vérifié',
    checkDobRecorded: 'Date de naissance enregistrée et statut de mineur déduit',
    checkConsent: 'Consentement du parent enregistré, avec date et preuve',
    checkCatalogue: 'Le niveau et les matières correspondent au catalogue',
    checkDuplicate: 'Aucun compte existant avec ce téléphone ou cet e-mail',
    checkRecordingDisclosed:
      'Enregistrement par défaut des cours individuels annoncé et accepté',
    checkNoSelfSignIn: 'Pas d’identifiants personnels sans accord explicite du parent',
    checkProfileLocked:
      'Profil visible uniquement par les parents, les enseignants affectés et le personnel',
    checkPassed: 'Conforme',
    checkFailed: 'Non satisfait',
    approve: 'Valider l’élève',
    approved: 'Élève validé',
    reject: 'Refuser',
    rejected: 'Élève refusé',
    requestInfo: 'Demander plus d’informations',
    requestedInfo: 'Informations demandées',
    reason: 'Motif (envoyé au parent)',
    reasonRequired: 'Indiquez un motif. Nous l’envoyons au parent.',
    noBulk: 'Les validations se font une par une, volontairement. Il n’y a pas d’action groupée.',
    approveBlocked:
      'Ce compte ne peut pas être validé tant que toutes les vérifications ne sont pas satisfaites.',
    reviewer: 'Examinateur',
    daysWaiting: 'Jours d’attente',
    documents: 'Documents',
    documentsCount: '{count} documents',
    openDocument: 'Ouvrir le document',
    postApprovalGate: 'Avant la première affectation',
    gateCodeOfConduct: 'Code de conduite accepté',
    gateSafeguarding: 'Politique de protection de l’enfance acceptée',
    gateCommercial: 'Conditions commerciales acceptées',
    gatePending: 'Pas encore accepté',
    gateAccepted: 'Accepté le {when}',
    suspend: 'Suspendre l’enseignant',
    suspended: 'Enseignant suspendu',
    suspendConsequences: 'Suspendre {name} va :',
    suspendConsequence1: 'annuler {count} séances à venir',
    suspendConsequence2: 'avertir les apprenants concernés et leurs parents',
    suspendConsequence3: 'geler ses versements en attendant l’examen du dossier',
    suspendConsequence4: 'renvoyer ses apprenants dans la file d’affectation',
  },

  support: {
    title: 'Affecter le service client',
    unassigned: 'Non affectés',
    myQueue: 'Ma file',
    agents: 'Agents',
    emptyTitle: 'Rien en attente',
    emptyBody: 'Les nouvelles demandes d’assistance apparaissent ici pour être affectées.',
    ticket: 'Ticket',
    channel: 'Canal',
    channelInApp: 'Messagerie de l’application',
    channelWhatsapp: 'WhatsApp',
    channelEmail: 'E-mail',
    category: 'Catégorie',
    categoryGeneral: 'Général',
    categoryBilling: 'Facturation',
    categoryTechnical: 'Technique',
    categorySafeguarding: 'Protection de l’enfance',
    categoryPaymentDispute: 'Litige de paiement',
    priority: 'Priorité',
    requester: 'Demandeur',
    subject: 'Objet',
    age: 'Ancienneté',
    slaCountdown: 'Première réponse attendue',
    slaBreached: 'En retard de {duration}',
    slaDueIn: 'Dans {duration}',
    openTickets: 'Ouverts',
    waitingOnUser: 'En attente de l’utilisateur',
    avgFirstResponse: 'Première réponse moyenne',
    presenceOnline: 'En ligne',
    presenceAway: 'Absent',
    presenceOffline: 'Hors ligne',
    assign: 'Affecter',
    assignTo: 'Affecter à',
    assignSelected: 'Affecter {count} tickets',
    assigned: 'Affecté à {name}',
    reassign: 'Réaffecter',
    escalate: 'Escalader',
    context: 'Contexte du ticket',
    contextSubscription: 'Abonnement',
    contextFreeze: 'État du compte',
    contextRecentPayments: 'Paiements récents',
    contextRecentSessions: 'Séances récentes',
    contextRecentErrors: 'Erreurs récentes',
    routedSafeguarding:
      'Dirigé vers la protection de l’enfance. N’apparaît pas dans la file générale.',
    routedFinance: 'Dirigé vers la file financière.',
    whatsappWindowOpen: 'Fenêtre WhatsApp ouverte encore {duration}. Vous pouvez répondre librement.',
    whatsappWindowClosed:
      'La fenêtre WhatsApp de 24 heures est fermée. Les réponses doivent utiliser un modèle approuvé.',
    whatsappTemplate: 'Modèle approuvé',
  },

  safeguarding: {
    title: 'Protection de l’enfance',
    restricted:
      'Cette file est réservée au personnel désigné. Chaque consultation est enregistrée.',
    notDesignatedTitle: 'Vous n’avez pas accès à cette file',
    notDesignatedBody:
      'La protection de l’enfance est réservée à un personnel nommé. Demandez à un super administrateur de vous désigner si cela relève de votre travail.',
    emptyTitle: 'Aucun signalement ouvert',
    emptyBody:
      'Les signalements venant des cours, des messageries et des profils apparaissent ici immédiatement.',
    source: 'Origine',
    sourceSession: 'Cours',
    sourceMessageThread: 'Fil de messages',
    sourceTeacherProfile: 'Profil enseignant',
    sourceRedactionFlag: 'Coordonnées bloquées',
    sourceOther: 'Autre',
    reporter: 'Signalé par',
    subjectOfReport: 'Concerne',
    evidence: 'Preuves',
    ageOfReport: 'Ancienneté',
    firstResponseDue: 'Première réponse attendue',
    firstResponseTarget: 'Objectif : {hours} heures',
    respond: 'Enregistrer la première réponse',
    responded: 'Première réponse enregistrée',
    state: 'État',
    stateOpen: 'Ouvert',
    stateInReview: 'En cours d’examen',
    stateActioned: 'Traité',
    stateClosed: 'Clos',
    suspendTeacherNow: 'Suspendre l’enseignant immédiatement',
    actionTaken: 'Mesure prise',
    close: 'Clore ce signalement',
    closed: 'Signalement clos',
    neverDeleted:
      'Les signalements et les preuves sont conservés intégralement. Rien ici ne peut être supprimé.',
    redactionFlags: 'Tentatives de partage de coordonnées',
    redactionFlagsBody:
      '{name} a tenté de partager ses coordonnées avec un apprenant {count} fois. Les coordonnées ont été retirées automatiquement.',
    redactionPhone: 'Numéro de téléphone',
    redactionEmail: 'Adresse e-mail',
    redactionSocial: 'Compte de réseau social',
  },

  payments: {
    title: 'Paiements',
    studentsPaidTitle: 'Élèves — payé',
    studentsOwingTitle: 'Élèves — impayés',
    teachersPaidTitle: 'Enseignants — payés',
    teachersPendingTitle: 'Enseignants — salaire en attente',
    earningsTitle: 'Heures enseignées et rémunérations',
    reconciliationTitle: 'Rapprochement',

    emptyPaidTitle: 'Aucun paiement sur cette période',
    emptyPaidBody: 'Modifiez la période, ou revenez après la prochaine échéance.',
    emptyOwingTitle: 'Personne n’est en retard',
    emptyOwingBody: 'Tous les apprenants sont à jour de leurs échéances.',
    emptyPendingTitle: 'Aucun versement en attente',
    emptyPendingBody:
      'Les rémunérations des enseignants apparaissent ici une fois la période calculée.',
    emptyReconciliationTitle: 'Tout correspond',
    emptyReconciliationBody: 'Rien n’est en écart avec les relevés des prestataires.',

    learner: 'Apprenant',
    payer: 'Payeur',
    plan: 'Formule',
    billingPeriod: 'Période',
    method: 'Moyen',
    methodMtnMomo: 'MTN MoMo',
    methodOrangeMoney: 'Orange Money',
    methodVisa: 'Visa',
    methodMastercard: 'Mastercard',
    amountPaid: 'Montant payé',
    paymentDate: 'Payé le',
    providerRef: 'Référence prestataire',
    invoiceNumber: 'Facture',
    planTypeFull: 'Payé en une fois',
    planTypeInstalments: '3 échéances',
    instalmentsDone: '{done} sur {total}',
    viewInvoice: 'Voir la facture',
    resendReceipt: 'Renvoyer le reçu',
    receiptResent: 'Reçu envoyé',
    refund: 'Rembourser',
    refunded: 'Remboursement lancé',
    refundReason: 'Pourquoi remboursez-vous ?',
    refundConfirm:
      'Rembourser {amount} à {payer} contrepasse les écritures comptables et le prévient. Cela ne peut pas être annulé ici.',
    financeOnly: 'Seul un administrateur financier peut faire cela.',

    totalFee: 'Montant total',
    paidToDate: 'Payé à ce jour',
    outstanding: 'Reste dû',
    daysOverdue: 'Jours de retard',
    accountState: 'Compte',
    stateActive: 'Actif',
    stateGrace: 'En délai de grâce',
    stateFrozen: 'Gelé',
    stateSuspended: 'Suspendu',
    lastAttempt: 'Dernière tentative',
    lastAttemptFailed: 'Échec : {reason}',
    lastReminder: 'Dernier rappel',
    neverReminded: 'Aucun envoyé',
    instalmentSchedule: 'Échéancier',
    instalmentNumber: 'Échéance {number}',
    instalmentScheduled: 'Prévue',
    instalmentDue: 'À payer',
    instalmentOverdue: 'En retard',
    instalmentPaid: 'Payée',
    instalmentCancelled: 'Soldée',
    dueOn: 'Échéance le {date}',
    sendReminder: 'Envoyer un rappel maintenant',
    reminderSent: 'Rappel envoyé',
    reminderChannel: 'Envoyer par',
    paymentHistory: 'Historique des paiements',
    setStage: 'Modifier l’état',
    setStageTitle: 'Modifier l’état des frais',
    current: 'Actuel',
    reasonHint: 'Pourquoi ce changement — correction, exonération, frais enregistrés ailleurs',
    stageAdjusted: 'État des frais réglé sur {stage}.',
    stageConsequence:
      'Cela change l’état sans paiement. Une écriture comptable équilibrée est enregistrée sur le solde de l’élève, avec ton nom et ton motif. Utilise « Enregistrer le paiement » si de l’argent a réellement été reçu.',
    register: 'Inscrire',
    registerTitle: 'Inscrire l’élève',
    registered: '{learner} inscrit. L’état des frais peut maintenant être défini.',
    choosePlan: 'Formule',
    howToPay: 'Mode de paiement des frais',
    startOn: 'Frais à partir du',
    registerConsequence:
      'Cela crée l’abonnement et son échéancier pour {total}. « Enregistrer le paiement » et « Modifier l’état » deviennent disponibles sur cette ligne.',
    registrationFee: 'Frais d’inscription (FCFA)',
    registrationFeeHint: 'Frais d’inscription unique, distinct de la scolarité. Mets 0 s’il n’y en a pas.',
    tuitionParts: 'Scolarité, répartie en tranches',
    tuitionTotal: 'Total scolarité',
    contractTotal: 'Total à payer',
    editPlan: 'Modifier le plan',
    editPlanTitle: 'Modifier le plan de paiement',
    planUpdated: 'Plan de paiement mis à jour pour {learner}.',
    savePlan: 'Enregistrer le plan',
    amount: 'Montant (FCFA)',
    partDueOn: 'Échéance',
    partsSum: 'Les tranches totalisent {sum} sur {total}',
    mustMatch: 'elles doivent correspondre exactement',
    editPlanConsequence:
      'Le total de la scolarité est la somme des tranches. Une tranche déjà payée ne peut pas être modifiée. L’élève et le payeur sont prévenus, et la modification est enregistrée avec ton nom et ton motif.',
    feesTitle: 'Élèves — frais',
    feesSubtitle: 'Tous les élèves inscrits, et où en sont leurs frais.',
    student: 'Élève',
    level: 'Niveau',
    feeStage: 'État des frais',
    progress: 'Tranches payées',
    noStudents: 'Aucun élève ne correspond',
    noStudentsBody: 'Essaie un autre niveau ou efface la recherche.',
    noSubscription: 'Non inscrit',
    stage: {
      not_registered: 'Non inscrit',
      registered: 'Inscription seulement',
      first: 'Première tranche',
      second: 'Deuxième tranche',
      completed: 'Soldé',
    },
    searchStudent: 'Chercher un élève, un payeur, un téléphone ou une facture',
    showingCount: '{shown} sur {total}',
    levelGroup: {
      all: 'Tous les niveaux',
      primary: 'Primaire',
      secondary: 'Secondaire',
      lower: 'Première',
      upper: 'Terminale',
    },
    recordPaymentTitle: 'Enregistrer un paiement',
    recordPayment: 'Enregistrer le paiement',
    amountReceived: 'Montant reçu (FCFA)',
    wholeFrancsOnly: 'Francs entiers uniquement',
    paidVia: 'Moyen de paiement',
    methodCash: 'Espèces',
    methodBank: 'Virement bancaire',
    evidenceRef: 'Référence justificative',
    evidenceHint: 'Numéro de reçu, identifiant de transaction ou référence de fichier',
    reason: 'Motif',
    recordConsequence:
      'Cela crée un paiement et les écritures comptables, émet une facture numérotée et solde les tranches dans l’ordre, en commençant par la plus ancienne impayée. Impossible de modifier ensuite — une correction est une écriture supplémentaire.',
    recordedPartial: '{count} tranche(s) soldée(s). Facture {invoice}.',
    recordedComplete: 'Frais soldés. Facture {invoice}.',
    recordOfflinePayment: 'Enregistrer un paiement reçu hors ligne',
    offlineAmount: 'Montant reçu',
    offlineReason: 'Pourquoi ce paiement est-il saisi à la main ?',
    offlineEvidence: 'Preuve',
    offlineRecorded: 'Paiement enregistré',

    teacher: 'Enseignant',
    period: 'Période',
    attendedMinutes: 'Minutes de présence',
    grossEarnings: 'Brut',
    deductions: 'Retenues',
    providerFee: 'Frais du prestataire',
    taxWithheld: 'Retenue fiscale',
    netPaid: 'Net versé',
    netPayable: 'Net à verser',
    payoutMethod: 'Versé sur',
    approvedBy: 'Approuvé par',
    paidAt: 'Versé le',
    kycComplete: 'KYC',
    walletVerified: 'Portefeuille',
    daysPending: 'Jours d’attente',
    whyThisNumber: 'D’où vient ce montant ?',
    sessionsBehind: 'Séances à l’origine de ce montant',
    approvePayout: 'Approuver le versement',
    payoutApproved: 'Versement approuvé',
    approveBatch: 'Approuver {count} versements',
    batchConfirmTitle: 'Confirmez chaque versement avant l’envoi',
    batchTotal: 'Total à envoyer : {amount}',
    blocked: 'Bloqué',
    blockedWalletUnverified: 'Le portefeuille de versement n’a pas été vérifié.',
    blockedKycIncomplete: 'Le KYC n’est pas complet.',
    blockedTeacherSuspended:
      'Cet enseignant est suspendu. Les rémunérations sont retenues, pas perdues.',
    blockedBelowMinimum: 'En dessous du minimum de versement de {minimum}.',
    blockedNothingPayable: 'Rien n’est dû pour cette période.',
    heldPendingReview: 'Retenu en attente d’examen',
    heldPendingReviewBody:
      'Cet enseignant est suspendu. {amount} est retenu et ne sera pas versé tant qu’une personne n’aura pas décidé de le libérer ou de le retenir.',
    release: 'Libérer les rémunérations retenues',
    withhold: 'Retenir les rémunérations',
    heldDecisionReason: 'Motif de cette décision',

    sessionsDelivered: 'Séances assurées',
    oneToOne: 'Individuel',
    group: 'Groupe',
    effectiveHourly: 'Taux horaire effectif',
    poolThisMonth: 'Enveloppe enseignants ce mois-ci',
    poolBasis: 'Base : {percent} % du chiffre d’affaires, {basis}',
    poolBasisGross: 'sur le brut',
    poolBasisNet: 'net de frais et d’impôts',
    poolUnresolved:
      'Le partage du chiffre d’affaires n’est pas arrêté commercialement (OI-02). Ces valeurs viennent de la configuration et sont enregistrées sur chaque ligne de rémunération.',
    unallocated: 'Enveloppe non répartie',
    unallocatedBody:
      '{amount} n’a pas pu être attribué car ces apprenants n’ont suivi aucune séance. La somme est retenue en attente d’une décision et ne sera pas déplacée automatiquement.',
    unallocatedDecide: 'Décider du sort de cette somme',
    unallocatedRelease: 'Répartir entre les enseignants',
    unallocatedRetain: 'Conserver comme revenu de la plateforme',
    unallocatedCarry: 'Reporter sur la période suivante',
    unallocatedDecided: 'Décision enregistrée',
    recalculate: 'Recalculer cette période',
    recalculated: 'Période recalculée',
    configVersion: 'Calculé avec {version}',

    provider: 'Prestataire',
    statementDate: 'Date du relevé',
    unmatchedItems: 'Éléments non rapprochés',
    matched: 'Rapproché',
    unmatched: 'Non rapproché',
    writtenOff: 'Passé en perte',
    escalated: 'Escaladé',
    matchTo: 'Rapprocher d’un paiement',
    matchedOk: 'Rapproché',
    writeOff: 'Passer en perte',
    writeOffReason: 'Pourquoi cet élément est-il passé en perte ?',
    writtenOffOk: 'Passé en perte',
    escalate: 'Escalader',
    stateMachine: 'États des paiements',
    stateInitiated: 'Initié',
    statePending: 'En cours',
    stateSucceeded: 'Réussi',
    stateFailed: 'Échoué',
    statePendingReconciliation: 'En attente de rapprochement',
    recheckHourly: 'Revérifié toutes les heures. Escalade si non résolu après {hours} heures.',
    thresholdAlert:
      'Les éléments non rapprochés dépassent le seuil d’alerte de {count} éléments ou {value}.',
  },

  freeze: {
    freeze: 'Geler le compte',
    unfreeze: 'Dégeler le compte',
    frozen: 'Compte gelé',
    unfrozen: 'Compte dégelé',
    frozenAutomatic: 'Gelé — impayé (automatique)',
    frozenManual: 'Gelé — manuel : {reason}',
    reason: 'Motif',
    reasonRequired: 'Indiquez un motif. Il est enregistré sur ce compte.',
    category: 'Catégorie',
    categoryNonPayment: 'Impayé',
    categorySafeguarding: 'Protection de l’enfance',
    categoryAbuse: 'Abus',
    categoryDispute: 'Litige',
    categoryOther: 'Autre',
    manualOutranks:
      'Un gel manuel n’est pas levé par un paiement. Seul un administrateur peut le lever.',
    confirmLearnerTitle: 'Geler ce compte',
    confirmLearnerBody:
      'Geler {name} annule {sessions} séances à venir et avertit le parent et {teachers} enseignants. Cette personne pourra encore se connecter, voir son solde et payer. Elle ne pourra pas rejoindre de cours, ouvrir de supports ni rendre de devoirs.',
    confirmUnfreezeBody:
      'Dégeler {name} rétablit son accès immédiatement. Les réservations reviennent si le créneau est encore libre ; sinon il lui sera demandé de réserver à nouveau.',
    confirmTeacherBody:
      'Geler {name} annule {sessions} séances à venir, avertit les apprenants concernés et leurs parents, gèle les versements en attendant l’examen du dossier, et renvoie {learners} apprenants dans la file d’affectation.',
    deferredMidSession:
      'Cet apprenant est en cours en ce moment. Le gel est enregistré et prendra effet à la fin du cours.',
    autoNoticeTrail: 'Avis envoyés avant ce gel',
    noticeBefore: '{days} jours avant',
    noticeDue: 'Le jour de l’échéance',
    noticeFreeze: 'Le jour du gel',
    triggeringInstalment: 'Déclenché par l’échéance {number}, due le {date}',
    frozenSince: 'Gelé depuis le {when}',
    liftedBy: 'Levé par {name}',
    payToUnfreeze: 'Payer cette échéance dégèle le compte immédiatement.',
  },

  accounts: {
    title: 'Comptes et accès',
    searchPlaceholder: 'Rechercher par nom, téléphone ou e-mail',
    emptyTitle: 'Rechercher un compte',
    emptyBody: 'Saisissez un nom, un numéro de téléphone ou une adresse e-mail.',
    noResultsTitle: 'Aucun résultat',
    noResultsBody: 'Vérifiez l’orthographe, ou essayez seulement le numéro de téléphone.',
    name: 'Nom',
    contact: 'Coordonnées',
    roles: 'Rôles',
    state: 'État',
    linkedRecords: 'Enregistrements liés',
    activeSessions: 'Connecté sur {count} appareils',
    grantRole: 'Attribuer un rôle',
    revokeRole: 'Retirer un rôle',
    roleGranted: 'Rôle attribué',
    roleRevoked: 'Rôle retiré',
    superAdminOnly: 'Seul un super administrateur peut modifier les rôles.',
    forceSignOut: 'Déconnecter de tous les appareils',
    signedOut: 'Déconnecté de tous les appareils',
    forceSignOutConfirm:
      'Cela met fin immédiatement à ses {count} sessions. La personne devra se reconnecter.',
    designateSafeguarding: 'Désigner pour la protection de l’enfance',
    removeSafeguarding: 'Retirer l’accès à la protection de l’enfance',
    designationChanged: 'Accès à la protection de l’enfance modifié',
    viewAs: 'Consulter en tant que cet utilisateur',
    viewAsReason: 'Pourquoi devez-vous consulter son compte ?',
    viewAsBanner:
      'Vous consultez le compte de {name}. Cette vue est en lecture seule et elle est enregistrée.',
    viewAsEnd: 'Quitter la vue de {name}',
  },

  reports: {
    title: 'Rapports',
    dateRange: 'Période',
    from: 'Du',
    to: 'Au',
    filterLevel: 'Niveau',
    filterSubject: 'Matière',
    filterRegion: 'Région',
    all: 'Tous',
    exportCsv: 'Exporter en CSV',
    exported: 'Export lancé',
    emptyTitle: 'Aucune donnée pour ces filtres',
    emptyBody: 'Élargissez la période, ou retirez un filtre.',
    readReplicaNote:
      'Les rapports lisent une copie de la base de données ; ils ne ralentissent jamais la plateforme.',
  },

  audit: {
    title: 'Journal d’audit',
    readOnly:
      'Ce journal est en ajout seul. Les entrées ne sont jamais modifiées ni supprimées.',
    emptyTitle: 'Aucune entrée ne correspond',
    emptyBody: 'Élargissez la période, ou retirez les filtres d’auteur et d’action.',
    when: 'Quand',
    actor: 'Qui',
    action: 'Quoi',
    entity: 'Sur',
    ip: 'Adresse IP',
    before: 'Avant',
    after: 'Après',
    reason: 'Motif',
    filterActor: 'Qui',
    filterAction: 'Action',
    filterEntity: 'Type d’enregistrement',
    system: 'Système',
    viewDetail: 'Voir l’entrée complète',
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

  /** Le dialogue catégorie → classe → matière, partagé par les deux listes. */
  assign: {
    teacherTitle: 'Classes et matières',
    teacherHint:
      'Choisissez chaque classe où enseigne cet enseignant, et les matières dans chacune. La même matière dans plusieurs classes est normale. Seules celles-ci apparaîtront dans son emploi du temps.',
    learnerTitle: 'Classe et matières',
    learnerHint:
      'Choisissez la classe de cet élève, puis les matières qu’il suit. Cocher une matière d’une autre classe le déplace dans cette classe.',
    noSubjects: 'Aucune matière n’est encore configurée pour cette classe.',
    selectedCount: '{count} sélectionnée(s)',
    open: 'Classes et matières',
  },
  /** Sélection de lignes en vue d’une suppression groupée. */
  bulk: {
    select: 'Sélectionner',
    done: 'Terminé',
    selectedCount: '{count} sélectionné(s)',
    deleteSelected: 'Supprimer la sélection',
    confirmTitle: 'Supprimer {count} compte(s) ?',
    confirmBody:
      'Ils seront déconnectés et retirés de toutes les listes, et ne pourront plus se connecter. Leurs actions restent dans le journal d’audit.',
    reasonLabel: 'Pourquoi supprimez-vous ces comptes ?',
    deleted: '{count} compte(s) supprimé(s).',
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
    timetable: {
      clash: 'Cela chevauche {count} heure(s) que vous avez déjà. Choisissez un autre horaire.',
      /* Ne nomme plus vendredi : la semaine scolaire est configurable. */
      day_out_of_range: 'Ce n’est pas un jour de la semaine.',
      outside_teaching_day: 'Les cours ont lieu entre 07:00 et 19:00.',
      reversed: 'L’heure de fin doit être après l’heure de début.',
      too_short: 'Un cours doit durer au moins 30 minutes.',
      too_long: 'Un cours ne peut pas dépasser 4 heures.',
      not_your_subject: 'Vous n’êtes pas approuvé pour enseigner cette matière à ce niveau.',
      already_decided: 'Cette heure a déjà été traitée.',
      note_required: 'Indiquez un motif pour refuser une heure.',
      /* Voir en.ts : une période est réservée, et non simplement proposée. */
      slot_taken: 'Un autre enseignant vient de prendre cette période. Choisissez-en une autre.',
      /* Nomme qui et quoi : le refus s’explique au lieu de seulement refuser. */
      slot_taken_by:
        '{teacher} enseigne déjà {subject} sur cette période. Choisissez-en une autre.',
      subject_full:
        'Vous avez déjà vos {max} périodes de cette matière dans cette classe. Choisissez une autre matière, ou une autre classe.',
      subject_days_full:
        'Vous enseignez déjà cette matière {max} jours cette semaine. Ajoutez la période à l’un de ces jours, ou demandez l’autorisation à un administrateur.',
      on_hold: 'Un administrateur a suspendu cette période. Demandez-lui de la libérer.',
      outside_school_week: 'Les cours ont lieu les {days} premiers jours de la semaine.',
    },

    /** BUILD-PLAN phase 3 — exercices de groupe. */
    exercise: {
      locks_before_due: 'L’heure de verrouillage ne peut pas précéder l’heure limite.',
      never_locks: 'Cet exercice n’a pas d’heure de verrouillage : il n’y a rien à réouvrir.',
      score_above_max: 'La note ne peut pas dépasser {maxScore}.',
      locked: 'Cet exercice est verrouillé. Demandez à votre enseignant de le réouvrir.',
    },
    group: {
      over_capacity: 'C’est plus d’élèves que le groupe ne peut contenir ({capacity}).',
      learner_not_at_level: 'L’un de ces élèves n’est pas dans cette classe.',
      not_this_exercise: 'Cet exercice n’a pas été donné à ce groupe.',
    },

    /** BUILD-PLAN phase 4 — examens. */
    exam: {
      needs_options: 'Une question à choix multiple exige au moins deux réponses.',
      no_correct_option:
        'Cochez la bonne réponse, sinon personne ne pourra marquer de points à cette question.',
      single_answer_only: 'Une question à réponse unique ne peut avoir qu’une bonne réponse.',
      structural_has_options: 'Une question structurale n’a pas de réponses à cocher.',
      closes_before_opens: 'L’heure de fermeture doit être après l’heure d’ouverture.',
      no_questions: 'Ajoutez au moins une question avant de publier.',
      not_your_group: 'Ce groupe n’est pas le vôtre.',
      answer_not_in_attempt: 'Cette réponse n’appartient pas à cette copie.',
      mark_above_question: 'Cette question ne vaut que {max} points.',
      unmarked_remain: '{unmarked} réponses structurales ne sont pas encore corrigées.',
    },

    /** BUILD-PLAN phase 6 — bulletins. */
    report: {
      bad_year: 'Écrivez l’année scolaire sous la forme 2026-2027.',
      learner_not_at_level: 'L’un de ces élèves n’est pas dans cette classe.',
      no_marks: 'Aucune note n’a encore été saisie pour cette classe et ce trimestre.',
    },

    /** BUILD-PLAN phase 5 — direct. */
    live: {
      one_audience: 'Un cours est soit pour un groupe, soit pour un élève, pas les deux.',
      already_live: 'Vous donnez déjà un cours. Terminez-le avant d’en commencer un autre.',
      subject_mismatch: 'Ce groupe n’étudie pas cette matière.',
      not_your_learner: 'Vous n’êtes pas affecté à cet élève.',
      slot_not_confirmed: 'Ce créneau n’est pas le vôtre, ou n’a pas été confirmé.',
      /* Dit à qui revient le problème : à la plateforme, pas à l’appareil. */
      upstream_unreachable:
        'Le serveur média ne répond pas. Le problème vient de nous, pas de vous — réessayez dans un instant.',
      not_configured:
        'Les cours en direct ne sont pas encore activés sur cette plateforme. Veuillez prévenir un administrateur.',
      /* Le lien n’est pas en cause : inutile de réessayer. */
      not_invited: 'Cet appel est sur invitation. Demandez à l’enseignant de vous inviter.',
    },

    /* Voir en.ts : sans ces clés, « errors.field.too_small » s'affichait tel quel. */
    field: {
      too_small: 'Ce champ est trop court.',
      too_big: 'Ce champ est trop long.',
      invalid_type: 'Ce champ est obligatoire.',
      invalid_string: 'Veuillez vérifier le format.',
      invalid_enum_value: 'Veuillez choisir l’une des options.',
      invalid_union: 'Veuillez vérifier cette valeur.',
      invalid_date: 'Veuillez indiquer une date valide.',
      not_multiple_of: 'Veuillez vérifier cette valeur.',
      custom: 'Veuillez vérifier cette valeur.',
    },
    /** Noms lisibles des champs que le serveur peut refuser. */
    fieldName: {
      highestQualification: 'Diplôme le plus élevé',
      institution: 'Établissement',
      qualificationYear: 'Année d’obtention',
      yearsExperience: 'Années d’expérience',
      payoutWallet: 'Numéro mobile money',
      payoutMethod: 'Méthode de paiement',
      languages: 'Langues d’enseignement',
      subjects: 'Matières et niveaux',
      nationalId: 'Numéro d’identité',
      bio: 'À propos de vous',
      address: 'Adresse',
    },
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
      incorrect: 'Ces identifiants ne correspondent pas. Vérifiez le mot de passe et réessayez.',
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
      /* Les deux identifiants existent ; la combinaison n’est pas au programme. */
      subject_not_taught_at_level:
        'L’une de ces matières n’est pas enseignée dans cette classe.',
      not_approved: 'Seuls les enseignants approuvés peuvent recevoir des apprenants.',
      already_applied: 'Vous avez déjà une candidature en cours.',
      application_closed: 'Cette candidature est close.',
      noRecord:
        'Votre profil d’enseignant n’a pas encore été créé. Demandez à un administrateur de le compléter.',
    },
    class: {
      notFound: 'Nous n’avons pas trouvé cette classe, ou vous ne l’enseignez pas.',
    },
    admin: {
      /* Le seul clic d’un écran de masse qui ne doit jamais passer inaperçu. */
      cannot_delete_self: 'Vous ne pouvez pas supprimer votre propre compte.',
    },
    student: {
      subjects_required: 'Choisissez au moins une matière pour cet élève.',
      /* Les deux identifiants existent ; la matière n’est pas au programme. */
      subject_not_taught_at_level:
        'L’une de ces matières n’est pas enseignée dans cette classe.',
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
    approval: {
      reason_required: 'Indiquez un motif. Nous l’envoyons au parent.',
      already_decided: 'Ce compte a déjà fait l’objet d’une décision.',
      checks_incomplete: 'Ces vérifications ne sont pas satisfaites : {missing}.',
      consent_missing:
        'Le consentement du parent n’a pas été enregistré. Un apprenant ne peut pas être validé sans lui.',
      guardian_unverified: 'Le compte parent lié n’a pas encore été vérifié.',
      duplicate_contact: 'Un autre compte utilise déjà ce numéro ou cet e-mail.',
      no_bulk: 'Les validations se font une par une.',
    },
    freeze: {
      reason_required: 'Indiquez un motif. Il est enregistré sur ce compte.',
      already_frozen: 'Ce compte est déjà gelé.',
      not_frozen: 'Ce compte n’est pas gelé.',
      manual_outranks:
        'Ce compte fait l’objet d’un gel manuel. Payer ne le lève pas — un administrateur doit le faire.',
      mid_session:
        'Cet apprenant est en cours. Le gel est enregistré et prendra effet à la fin du cours.',
    },
    payout: {
      wallet_unverified: 'Le portefeuille de versement n’a pas été vérifié.',
      kyc_incomplete: 'Le KYC de cet enseignant n’est pas complet.',
      teacher_suspended:
        'Cet enseignant est suspendu. Ses rémunérations sont retenues en attente d’une décision.',
      below_minimum: 'C’est en dessous du minimum de versement de {minimum}.',
      nothing_payable: 'Rien n’est dû pour cette période.',
      already_approved: 'Ce versement a déjà été approuvé.',
      decision_required:
        'Quelqu’un doit décider de libérer ou de retenir cette somme. Indiquez un motif.',
    },
    refund: {
      reason_required: 'Indiquez pourquoi vous remboursez.',
      not_refundable: 'Seul un paiement réussi peut être remboursé.',
      exceeds_payment:
        'Un remboursement ne peut pas dépasser le paiement qu’il contrepasse.',
    },
    offlinePayment: {
      reason_required: 'Indiquez pourquoi ce paiement est saisi à la main.',
      evidence_required: 'Joignez une preuve du paiement.',
    },
    safeguarding: {
      not_designated:
        'La protection de l’enfance est réservée au personnel désigné. Demandez à un super administrateur si cela relève de votre travail.',
      already_closed: 'Ce signalement est déjà clos.',
      action_required: 'Enregistrez la mesure prise avant de clore le signalement.',
    },
    support: {
      not_your_ticket: 'Ce ticket est affecté à quelqu’un d’autre.',
      agent_not_found: 'Cet agent n’existe pas ou n’est pas un agent de support.',
      whatsapp_window_closed:
        'La fenêtre WhatsApp de 24 heures est fermée. Utilisez un modèle approuvé.',
    },
    reconciliation: {
      note_required: 'Indiquez pourquoi cet élément est passé en perte.',
      already_resolved: 'Cet élément a déjà été résolu.',
    },
    instalment: {
      already_paid: 'Cette échéance est déjà payée.',
      schedule_exists: 'Cet abonnement possède déjà un échéancier.',
      does_not_sum: 'Les échéances ne totalisent pas le montant dû.',
    },
    role: {
      super_admin_only: 'Seul un super administrateur peut attribuer ou retirer des rôles.',
      cannot_remove_last_super_admin: 'Il doit rester au moins un super administrateur.',
    },
    schedule: {
      tuition_required: 'La scolarité doit être supérieure à zéro.',
      whole_francs: 'Les montants doivent être en francs entiers.',
      must_sum_to_total: 'Les tranches totalisent {given}, alors que le total est {total}.',
      unknown_part: 'Cette tranche ne fait pas partie de ce plan.',
      part_already_paid: 'La tranche {number} est déjà payée et ne peut pas être modifiée.',
    },
    subscription: {
      no_payer:
        'Cet élève n’a ni tuteur associé ni compte personnel : il n’y a personne à facturer. Associe d’abord un tuteur, ou convertis-le en apprenant adulte.',
      already_registered: 'Cet élève a déjà un abonnement actif.',
      plan_unavailable: 'Cette formule n’est pas disponible. Choisis-en une autre.',
      bad_start_date: 'Cette date de début n’est pas valide.',
    },
    adjustment: {
      reason_required: 'Indique un motif — il est enregistré avec ton nom.',
    },
    file: {
      no_extension:
        'Ce fichier n’a pas de type. Veuillez le renommer, par exemple en « .pdf ».',
      empty: 'Ce fichier est vide. Veuillez en choisir un autre.',
      too_large: 'Ce fichier dépasse {maxMb} Mo. Veuillez utiliser un fichier plus petit.',
      type_blocked: 'Nous n’acceptons pas les fichiers « .{extension} » pour des raisons de sécurité.',
      type_not_allowed: 'Veuillez utiliser l’un de ces types de fichiers : {allowed}.',
      upload_rejected: 'Le stockage a refusé ce fichier. Réessaie.',
      /* Voir en.ts : la panne est de notre côté, le message doit le dire. */
      storage_unavailable:
        'Nous n’avons pas pu joindre notre stockage de fichiers. Vos informations sont enregistrées — réessayez l’envoi dans un instant.',
      already_uploaded: 'Ce fichier a déjà été envoyé.',
      no_teacher_profile:
        'Ton compte enseignant n’est pas encore configuré. Déconnecte-toi, reconnecte-toi et ouvre la page enseignant avant de téléverser.',
      could_not_record:
        'Nous n’avons pas pu enregistrer ce fichier. La référence est dans le journal du serveur — préviens la personne qui gère la plateforme.',
      upload_not_found: 'Nous n’avons pas reçu ce fichier. Veuillez réessayer de l’envoyer.',
      rejected: 'Nous n’avons pas pu accepter ce fichier. Veuillez réessayer de l’envoyer.',
      quarantined:
        'Ce fichier n’a pas passé notre contrôle de sécurité et a été supprimé. Analysez votre appareil et essayez un autre fichier.',
      not_available:
        'Ce fichier n’est pas encore consultable. Nous vérifions la sécurité de chaque fichier avant son ouverture.',
    },
  },

  notifications: {
    fees: {
      registered: {
        subject: 'Frais de scolarité enregistrés',
        body: 'Les frais de {learner} ont été enregistrés. Le plan de paiement est ci-dessous.',
      },
      status_changed: {
        subject: 'État des frais mis à jour',
        body: 'L’état des frais de {learner} est maintenant {stage}.',
      },
      plan_changed: {
        subject: 'Plan de paiement modifié',
        body: 'Le plan de paiement de {learner} a été mis à jour. Les nouvelles dates et montants sont sur la page Frais.',
      },
      payment_received: {
        subject: 'Paiement reçu',
        body: 'Un paiement de {amount} a été enregistré pour {learner}. Merci.',
      },
    },
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
    /** Destiné au personnel, pas au candidat. Voir en.ts. */
    teacherVerificationPending: {
      subject: 'Un enseignant attend une vérification',
      /* `>` et non `→` — voir en.ts : hors GSM-7. */
      body: '{applicant} a envoyé une candidature à examiner. Ouvrez Approbations > Enseignants pour la consulter.',
    },
    /* Nommé et expliqué : un fichier qui disparaît est renvoyé à l’identique. */
    /* « Cliquez ici pour me rejoindre en direct », en message de boîte de réception. */
    liveInvitation: {
      subject: 'Vous êtes invité à une session en direct',
      body: 'Bonjour {name}, votre enseignant vous invite à le rejoindre en direct. Ouvrez la plateforme et cliquez pour rejoindre.',
    },
    teacherDocumentRemoved: {
      subject: 'Un document a été retiré de votre candidature',
      body: 'Bonjour {name}, nous avons retiré « {fileName} » de votre candidature. Motif : {reason}. Merci d’envoyer le bon fichier dès que possible.',
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

    studentApproved: {
      subject: '{learner} est validé',
      body: 'Bonjour {name}, le compte de {learner} est validé. Vous pouvez réserver des cours dès maintenant.',
    },
    studentRejected: {
      subject: 'À propos du compte de {learner}',
      body: 'Bonjour {name}, nous n’avons pas pu valider le compte de {learner}. Motif : {reason}. Répondez à ce message et nous vous aiderons.',
    },
    studentMoreInfo: {
      subject: 'Il nous manque une information sur {learner}',
      body: 'Bonjour {name}, il nous faut plus d’informations avant de valider {learner} : {reason}.',
    },

    instalmentDueSoon: {
      subject: 'Paiement à effectuer dans {days} jours pour {learner}',
      body: 'Bonjour {name}, l’échéance {instalment} de {amount} FCFA pour {learner} est à payer le {dueOn}. Payez dans l’application pour que les cours continuent.',
    },
    instalmentDueToday: {
      subject: 'Paiement à effectuer aujourd’hui pour {learner}',
      body: 'Bonjour {name}, l’échéance {instalment} de {amount} FCFA pour {learner} est à payer aujourd’hui. Payez dans l’application pour que les cours continuent.',
    },
    instalmentFreezeWarning: {
      subject: 'Dernier jour pour payer pour {learner}',
      body: 'Bonjour {name}, l’échéance {instalment} de {amount} FCFA pour {learner} était à payer le {dueOn}. Sans paiement aujourd’hui, les cours seront mis en pause. Vous pouvez payer dans l’application en une seule fois.',
    },
    accountFrozen: {
      subject: 'Cours en pause pour {learner}',
      body: 'Bonjour {name}, les cours de {learner} sont en pause car l’échéance {instalment} de {amount} FCFA n’a pas été payée. Vous pouvez toujours vous connecter, voir l’emploi du temps et payer. Le paiement relance les cours immédiatement.',
    },
    accountUnfrozen: {
      subject: 'Les cours de {learner} reprennent',
      body: 'Bonjour {name}, merci. Les cours de {learner} ont repris.',
    },
    sessionsCancelledAccountFrozen: {
      subject: 'Des cours ont été annulés',
      body: 'Bonjour {name}, {count} de vos cours à venir ont été annulés car le compte de l’apprenant est suspendu. Nous vous préviendrons dès qu’il sera rétabli.',
    },
    rebookNeeded: {
      subject: 'Veuillez réserver à nouveau {count} cours',
      body: 'Bonjour {name}, votre compte est de nouveau actif. {count} de vos anciens créneaux ont été pris ; choisissez-en de nouveaux dans l’application.',
    },
    teacherSuspendedSessionsCancelled: {
      subject: 'Changement concernant vos prochains cours',
      body: 'Bonjour {name}, {count} de vos prochains cours sont annulés le temps d’un examen interne. Nous organisons un autre enseignant et vous confirmerons les nouveaux horaires très vite.',
    },

    paymentReceipt: {
      subject: 'Votre reçu {invoice}',
      body: 'Bonjour {name}, voici votre reçu de {amount} FCFA. Numéro de facture {invoice}.',
    },
    refundIssued: {
      subject: 'Nous avons remboursé {amount} FCFA',
      body: 'Bonjour {name}, nous avons remboursé {amount} FCFA pour {learner}. Le versement peut prendre quelques jours.',
    },

    ticketAssigned: {
      subject: '{count} tickets vous sont affectés',
      body: 'Bonjour {name}, {count} tickets d’assistance vous ont été affectés.',
    },
  },

  adminMessages: {
    title: 'Messages',
    subtitle: 'Conversations ouvertes par les élèves avec l’aide ClassConnect.',
    search: 'Chercher par élève ou par message',
    none: 'Pas encore de messages',
    noneBody: 'Quand un élève écrit à l’aide ClassConnect, la conversation apparaît ici.',
    selectThread: 'Choisis une conversation à lire et à laquelle répondre.',
    new: 'À répondre',
    awaiting: '{count} en attente de réponse',
    reply: 'Écrire une réponse',
    sending: 'Envoi…',
    send: 'Envoyer la réponse',
    scanning: 'fichier en cours de vérification',
    redacted: 'Des coordonnées ont été retirées de ce message.',
    redactionNotice:
      'Les numéros de téléphone, e-mails et pseudos sont aussi retirés des réponses. Tout reste sur ClassConnect.',
  },

  teach: {
    step: {
      about: 'À propos de toi',
      aboutHelp: 'Nous vérifions chaque enseignant avant son premier cours. Cela protège les élèves et cela te protège.',
      video: 'Présente-toi',
      documents: 'Tes documents',
    },
      documentKind: 'Niveau d’études le plus élevé',
      documentKindHint: 'Ton diplôme, ton certificat ou ton autorisation d’enseigner.',
      identityUpload: 'Carte d’identité ou passeport',
      identityUploadHint: 'Une photo ou un scan bien lisible. Ce doit être la même personne que dans ta vidéo.',
      identityReplace: 'Remplacer',
      identityUploaded: 'Envoyé',
      watchYourVideo: 'Regarder ta vidéo',
      videoUploaded: 'Ton introduction est enregistrée. Regarde-la avant d’envoyer.',
      replaceVideo: 'Réenregistrer',
    preview: {
      confirm: 'C’est bon — envoyer',
      chooseAnother: 'Choisir un autre',
      uploading: 'Envoi…',
      scanning: 'Vérification…',
      ready: 'Prêt',
      failed: 'Non envoyé',
      noPdfViewer: 'Ton navigateur ne peut pas afficher ce PDF ici. Il sera quand même envoyé.',
    },
    checklist: {
      title: 'Avant d’envoyer',
      idDocument: 'Carte d’identité ou passeport',
      /* La pièce d’identité a sa propre case ; le sélecteur général ne l’enregistre pas. */
      idDocumentWhere:
        'Utilisez la case « Carte d’identité ou passeport » à l’étape 3 — pas le sélecteur de documents en dessous.',
      certificate: 'Diplôme ou certificat',
      help: 'Tu peux enregistrer et revenir. Nous examinons seulement quand tout est là.',
    },
    /** L’état du formulaire, avant le bouton plutôt qu’après. Voir en.ts. */
    needed: {
      title: 'Remplissez ceci avant d’envoyer :',
      ready: 'Tout ce qu’il nous faut est là. Vous pouvez envoyer maintenant.',
      stillToAdd:
        'Vous pouvez envoyer maintenant et ajouter ceci ensuite — nous ne pourrons simplement pas vous approuver avant : {items}.',
      sent: 'Envoyé. Votre candidature est entre les mains de notre équipe — nous vous préviendrons dès qu’elle aura été examinée.',
    },
    /** L’état du formulaire après l’envoi, et après une décision. Voir en.ts. */
    decision: {
      lockedTitle: 'Votre candidature est en cours d’examen',
      lockedBody:
        'Elle est entre les mains de notre équipe : elle ne peut pas être modifiée pendant sa lecture. S’il leur faut autre chose, ils vous le diront et ce formulaire se rouvrira.',
      rejectedTitle: 'Pourquoi cela n’a pas été approuvé',
      moreInfoTitle: 'Ce qu’il nous faut encore de votre part',
    },
    intro: {
      title: 'Présente-toi en vidéo',
      help: 'Jusqu’à 3 minutes. Dis-nous qui tu es, ce que tu enseignes et comment. Notre équipe la regarde avant de t’approuver — cela confirme aussi que tu es bien la personne sur ta pièce d’identité.',
      enableCamera: 'Activer la caméra',
      start: 'Commencer l’enregistrement',
      stop: 'Arrêter',
      use: 'Utiliser cet enregistrement',
      retake: 'Recommencer',
      orUpload: 'Ou téléverse une vidéo que tu as déjà',
      uploading: 'Envoi de ta vidéo…',
      reviewHint: 'Regarde-la. Utilise-la, ou recommence — autant de fois que tu veux.',
      unsupported:
        'Nous n’avons pas pu accéder à ta caméra. Vérifie l’autorisation du navigateur, ou téléverse une vidéo.',
    },
  },
timetable: {
    teacherDescription: 'Choisissez les heures que vous enseignerez. Un admin les confirme avant qu’elles ne deviennent des cours.',
    adminTitle: 'Approbations d’emploi du temps',
    adminDescription: 'Les heures proposées par les enseignants. Confirmer une heure la place sur l’emploi du temps de la classe.',
    nonePending: 'Aucune heure n’attend de décision.',
    addTitle: 'Proposer une heure',
    classAndSubject: 'Classe et matière',
    dayLabel: 'Jour',
    from: 'De',
    to: 'À',
    propose: 'Proposer cette heure',
    proposed: 'Envoyé. Un admin va la confirmer.',
    withdraw: 'Retirer',
    confirm: 'Confirmer',
    reject: 'Refuser',
    free: 'Rien de prévu',
    noSubjects: 'Vous n’avez encore aucune matière approuvée, il n’y a donc rien à planifier.',
    confirmedHours: 'Heures confirmées par semaine',
    confirmedHoursHint: 'Seules les heures confirmées comptent pour vos gains.',
    clashTitle: 'Cela chevauche des heures que vous avez déjà :',
    notePlaceholder: 'Motif — requis pour refuser, l’enseignant le verra',
    state: {
      proposed: 'En attente d’approbation',
      confirmed: 'Confirmé',
      rejected: 'Refusé',
      on_hold: 'Suspendu',
    },
    /* Jusqu’à dimanche : la semaine scolaire est configurable. */
    day: {
      monday: 'Lundi',
      tuesday: 'Mardi',
      wednesday: 'Mercredi',
      thursday: 'Jeudi',
      friday: 'Vendredi',
      saturday: 'Samedi',
      sunday: 'Dimanche',
    },
  },

  /** La semaine de chaque classe, sur un seul écran d’administration. */
  timetableOverview: {
    description:
      'Chaque classe, du lundi au samedi, avec la matière et l’enseignant de chaque période.',
    empty: 'Aucune classe n’a encore été configurée.',
    classesTimetabled: '{done} classes sur {total} ont un emploi du temps',
    noTimetable: 'Pas encore d’emploi du temps',
    freePeriod: 'Période libre',
  },

  /** BUILD-PLAN phase 2 — les leçons qu’un enseignant publie pour une classe. */
  lessons: {
    teacherDescription:
      'Publiez une leçon pour l’une de vos classes. Toute la classe la reçoit et peut la lire dans l’application ou la garder pour la lire hors connexion.',
    publishTitle: 'Publier une leçon',
    listTitle: 'Leçons que vous avez publiées',
    classAndSubject: 'Classe et matière',
    titleLabel: 'Ce que la classe verra',
    titlePlaceholder: 'La photosynthèse — partie 1',
    topicLabel: 'Thème ou chapitre',
    chooseFile: 'Le fichier',
    accepted: 'PDF, Word, photo, vidéo ou audio. Jusqu’à 100 Mo.',
    publish: 'Publier pour la classe',
    uploading: 'Envoi de votre leçon…',
    publishedOk: 'Publiée. Toute la classe peut l’ouvrir dès maintenant.',
    /* Voir en.ts : le fichier est chez nous, pas encore chez la classe. */
    pendingOk:
      'Envoyée et conservée en sécurité. Nous vérifions qu’elle ne contient pas de virus ; votre classe la verra dès que ce contrôle sera terminé.',
    none: 'Vous n’avez encore publié aucune leçon.',
    noSubjects: 'Vous n’avez encore aucune matière approuvée : il n’y a donc pas de classe où publier.',
    remove: 'Retirer',
    state: {
      clean: 'Publiée',
      pending: 'En cours de vérification',
      awaiting_upload: 'Non envoyée',
      quarantined: 'Refusée',
    },
  },

  /** La boîte de réception de l’enseignant. */
  teacherMessages: {
    description:
      'Échangez avec ClassConnect et avec les familles des élèves que vous enseignez.',
    contactAdmin: 'Écrire à ClassConnect',
    none: 'Aucune conversation pour l’instant.',
    pickOne: 'Choisissez une conversation pour la lire.',
    empty: 'Aucun message pour l’instant. Dites bonjour.',
    placeholder: 'Écrivez un message…',
    send: 'Envoyer',
    closed: 'Cette conversation est en lecture seule.',
    /* FR-SAF-002, indiqué sur le message concerné. Voir en.ts. */
    redacted: 'Un numéro de téléphone ou une adresse a été retiré de ce message.',
    role: {
      admin: 'ClassConnect',
      learner: 'Élève',
      guardian: 'Parent',
    },
  },

  /** BUILD-PLAN phase 3 — groupes et exercices. */
  teacherGroups: {
    description:
      'Constituez des groupes et donnez-leur des exercices. Un groupe se verrouille tout seul à l’heure que vous fixez.',
    createTitle: 'Créer un groupe',
    groupName: 'Nom du groupe',
    groupNamePlaceholder: 'Form 3 Maths — groupe du mardi',
    capacity: 'Nombre maximal d’élèves',
    create: 'Créer le groupe',
    created: 'Groupe créé. Ajoutez-y des élèves.',
    noSubjects:
      'Vous n’avez encore aucune matière approuvée : il n’y a donc pas de classe à regrouper.',
    none: 'Vous n’avez encore créé aucun groupe.',
    learnerCount: '{count} élèves sur {capacity}',
    members: 'Élèves',
    pickMembers: 'Cochez tous les membres de ce groupe',
    noCandidates: 'Personne à ce niveau ne suit encore cette matière.',
    saveMembers: 'Enregistrer {count} élèves',
    membersSaved: 'Composition du groupe enregistrée.',
    setExercise: 'Donner un exercice',
    exerciseTitle: 'Ce que le groupe verra',
    instructions: 'Consignes',
    dueAt: 'À rendre le',
    locksAt: 'Verrouillage à',
    /* Les deux dates ne font pas la même chose — voir en.ts. */
    locksAtHint:
      'Un travail rendu après l’heure limite est accepté et marqué en retard. Après l’heure de verrouillage, plus rien n’est accepté : seul vous ou un admin pouvez réouvrir.',
    maxScore: 'Sur',
    createExercise: 'Donner l’exercice',
    exerciseCreated: 'Exercice donné. Votre groupe le voit maintenant.',
    submissions: '{count} rendu(s)',
    lockState: {
      open: 'Sans échéance',
      scheduled: 'Ouvert',
      closing_soon: 'Bientôt fermé',
      locked: 'Verrouillé',
      reopened: 'Réouvert',
    },
    unlock: 'Réouvrir',
    unlockReason: 'Pourquoi réouvrez-vous cet exercice ? Le motif est enregistré.',
    unlocked: 'Réouvert. Le groupe peut rendre à nouveau.',
    groupScore: 'Note de groupe',
    groupScoreIs: 'Note de groupe {score}/{maxScore}',
    scorePrompt: 'Note de groupe, sur {maxScore}',
    scoreOutOfRange: 'Cette note n’est pas comprise entre 0 et {maxScore}.',
    scored: 'Note de groupe enregistrée.',
  },

  /** BUILD-PLAN phase 4 — examens. */
  teacherExams: {
    description:
      'Composez des examens pour vos classes. Les questions à choix multiple se corrigent seules ; vous corrigez les structurales.',
    setExam: 'Composer un examen',
    newExam: 'Nouvel examen',
    examTitle: 'Titre de l’examen',
    durationMin: 'Minutes accordées',
    question: 'Question {number}',
    questionType: 'Type',
    marks: 'Points',
    type: {
      single_choice: 'Choix multiple — une réponse',
      multiple_response: 'Choix multiple — plusieurs réponses',
      free_response: 'Structurale — vous corrigez',
    },
    options: 'Réponses',
    optionPlaceholder: 'Réponse {number}',
    isCorrect: 'Cette réponse est correcte',
    addOption: 'Ajouter une réponse',
    tickCorrect: 'Cochez la bonne réponse. Les élèves ne la voient jamais.',
    structuralHint: 'L’élève rédige sa réponse, et vous la corrigez après remise.',
    addQuestion: 'Ajouter une question',
    removeQuestion: 'Retirer cette question',
    saveDraft: 'Enregistrer comme brouillon',
    created: 'Enregistré comme brouillon. Publiez-le quand le sujet est prêt.',
    /* Dit avant le choix, pas après la correction du serveur. Voir en.ts. */
    deferredNotice:
      'Ce sujet contient une question structurale : les résultats sont retenus jusqu’à ce que vous l’ayez corrigée. Une note qui ignore la moitié de la copie n’est pas un résultat.',
    none: 'Vous n’avez encore composé aucun examen.',
    questionSummary: '{questions} questions · {marks} points',
    structuralCount: '{count} à corriger à la main',
    submittedCount: '{count} copie(s) rendue(s)',
    state: { draft: 'Brouillon', published: 'Publié' },
    publish: 'Publier',
    published: 'Publié. Votre classe le voit maintenant.',
    mark: 'Corriger',
    release: 'Publier les résultats',
    released: 'Résultats transmis à la classe.',
    noAttempts: 'Personne n’a encore rendu.',
    needsMarking: '{count} à corriger',
    fullyMarked: 'Entièrement corrigé',
    terminated: 'Arrêté avant la fin — à lire',
    openScript: 'Ouvrir la copie',
    marking: 'Correction de {name}',
    worth: 'Vaut {marks} points',
    awarded: 'Points accordés',
    noAnswer: 'Pas de réponse',
    correctMark: '✓',
    wrongMark: '✗',
    saveMarks: 'Enregistrer les points',
    saveAndRelease: 'Enregistrer et transmettre à cet élève',
    marked: 'Points enregistrés.',
  },

  /** BUILD-PLAN phase 6 — bulletins. */
  teacherReports: {
    description:
      'Saisissez les notes trimestrielles de votre matière. Les bulletins sont générés quand toutes les matières sont rentrées.',
    term: 'Trimestre',
    termName: {
      term_1: 'Premier trimestre',
      term_2: 'Deuxième trimestre',
      term_3: 'Troisième trimestre',
    },
    academicYear: 'Année scolaire',
    coefficient: 'Coefficient',
    /* La pondération camerounaise, expliquée là où on la choisit. */
    coefficientHint:
      'Le coefficient pondère la matière dans la moyenne. Les maths à 4 comptent quatre fois plus qu’une matière à 1.',
    readinessTitle: 'Notes de cette classe',
    readinessSummary: '{done} matières sur {total} saisies, pour {learners} élèves.',
    generationIsStaff:
      'Les bulletins sont générés par un administrateur quand toutes les matières sont rentrées, afin que la moyenne et le rang soient justes du premier coup.',
    noLearners: 'Personne à ce niveau ne suit encore cette matière.',
    markOutOf:
      'Notes sur {max}. Laissez la case vide si vous n’avez pas encore corrigé cet élève.',
    classAverage: 'Moyenne de la classe pour l’instant : {average}',
    learner: 'Élève',
    mark: 'Note',
    status: 'Enregistré',
    savedAlready: 'Enregistré',
    notYet: '—',
    submit: 'Soumettre ces notes',
    saved: '{count} notes enregistrées.',
  },

  /** BUILD-PLAN phase 5 — direct. */
  teacherLive: {
    description:
      'Démarrez un cours depuis votre emploi du temps et décidez qui peut y prendre la parole.',
    /* Trois causes, trois phrases — voir en.ts : « Non » se lit comme un réglage. */
    notRecording: {
      storage:
        'Ce cours n’est PAS enregistré. La plateforme n’a pas encore d’espace de stockage — les clés sont manquantes. Rien de ce que vous faites dans la salle ne peut y remédier ; prévenez la personne qui administre la plateforme.',
      media_server:
        'Ce cours n’est PAS enregistré, car le serveur média n’est pas connecté.',
      egress_failed:
        'Ce cours n’est PAS enregistré. L’enregistreur a refusé de démarrer ; le cours continue, mais il n’est pas conservé.',
    },
    /* Le serveur média manquant, dit une fois et clairement. Voir en.ts. */
    noMediaTitle: 'La vidéo et le son ne sont pas encore branchés',
    noMediaBody:
      'Tout sur cet écran est réel : la salle, la liste de présence, les mains levées et les autorisations. La vidéo et le son eux-mêmes exigent un serveur média, qui n’est pas encore installé. Les minutes de présence viennent aussi de ce serveur : elles affichent zéro jusque-là.',
    liveNow: 'En direct',
    elapsed: 'En cours depuis {minutes} minutes',
    end: 'Terminer le cours',
    /* Affiché quand la salle elle-même a terminé le cours. Voir en.ts. */
    ended: 'Cours terminé. L’enregistrement a été arrêté.',
    endedEligible: 'Cours terminé après {minutes} minutes. Il compte pour vos revenus.',
    endedIneligible:
      'Cours terminé après {minutes} minutes. Il ne compte pas pour vos revenus : trop court, ou hors de votre emploi du temps confirmé.',
    earningsFloor: 'Revenus',
    pastFloor: 'Au-delà de {minutes} minutes',
    beforeFloor: 'Moins de {minutes} minutes',
    timetableSlot: 'Emploi du temps',
    insideSlot: 'Dans un créneau confirmé',
    outsideSlot: 'Hors de votre emploi du temps',
    recording: 'Enregistrement',
    attendedRecorded: 'Présence relevée par le serveur média : {minutes} minutes.',
    roster: 'Qui est là ({present} présents)',
    noRoster: 'Ce cours n’a pas de groupe : il n’y a pas de liste de présence.',
    present: 'Présent',
    absent: 'Absent',
    letSpeak: 'Donner la parole',
    speaking: 'A la parole',
    hands: 'Mains levées ({count})',
    noHands: 'Personne ne demande la parole.',
    grant: 'Donner la parole',
    dismiss: 'Pas maintenant',
    speakers: 'Qui peut parler',
    revoke: 'Couper',
    fromTimetable: 'Démarrer depuis votre emploi du temps',
    fromTimetableHint:
      'Seuls les cours donnés dans un créneau confirmé comptent pour vos revenus, à {rate} FCFA l’heure.',
    nothingToday: 'Aucun cours confirmé n’est prévu aujourd’hui.',
    goLive: 'Passer en direct',
    goLiveAnyway: 'Passer en direct quand même',
    startsIn: 'Commence dans {minutes} min',
    slotNeedsGroup: 'Aucun groupe affecté à ce créneau',
    adHocTitle: 'Démarrer un cours hors emploi du temps',
    adHocHint:
      'Vous pouvez enseigner à tout moment. Un cours hors créneau confirmé est enregistré et diffusé de la même façon, mais il ne génère pas de revenus.',
    noGroups: 'Créez d’abord un groupe — un cours en direct a besoin d’élèves.',
    started: 'Vous êtes en direct.',
    group: 'Groupe',
  },

  /** Mes cours en direct. */
  teacherRecordings: {
    description: 'Revoyez les cours que vous avez donnés, jour par jour.',
    none: 'Vous n’avez encore donné aucun cours.',
    type: { one_to_one: 'Cours particulier', group: 'Cours de groupe' },
    attended: '{minutes} minutes de présence',
    length: '{minutes} min',
    watch: 'Revoir',
    audioOnly: 'Écouter — audio seul, bien plus léger',
    availableUntil: 'Disponible jusqu’au {date}',
    /* Quatre raisons différentes d’absence de vidéo. Voir en.ts. */
    state: {
      ready: 'Prêt',
      processing: 'L’enregistrement est encore en traitement.',
      in_progress: 'Ce cours est encore en cours.',
      not_recorded: 'Ce cours n’a pas été enregistré.',
    },
  },

  /** L’archive de tous les cours enregistrés, côté administration. */
  adminRecordings: {
    /* Le parcours : catégorie, puis classe, puis matière. */
    breadcrumb: 'Où vous êtes',
    lessonCount: '{count} leçons',
    otherSection: 'Groupes et appels sur invitation',
    otherHint: '{count} enregistrements qui n’appartiennent à aucune classe',
    emptyCategory: 'Aucune leçon n’a encore été enregistrée dans cette catégorie.',
    emptyClass: 'Aucune leçon n’a encore été enregistrée pour cette classe.',
    description:
      'Tous les cours enregistrés de la plateforme. Choisissez une catégorie, puis une classe, puis une matière. La suppression est définitive et détruit le fichier lui-même.',
    none: 'Aucun enregistrement ne correspond à ce filtre.',
    search: 'Rechercher une matière, un enseignant ou une classe',
    showing: '{shown} sur {total} affichés',
    delete: 'Supprimer cet enregistrement',
    confirmDelete:
      'Supprimer définitivement l’enregistrement de {subject} ? Le fichier vidéo est détruit et cette action est irréversible.',
    deleted: 'L’enregistrement de {subject} a été supprimé.',
    legalHold:
      'Conservé pour un examen de protection de l’enfance ou un litige. Il ne peut pas être supprimé tant que la conservation est en vigueur.',
    band: {
      all: 'Tous',
      primary: 'Primaire',
      secondary: 'Secondaire',
      sixth_form: 'Première & Terminale',
      private: 'Cours particuliers',
    },
  },

  /** Revoir un cours — partagé par les bibliothèques élève, enseignant et admin. */
  recordings: {
    watch: 'Revoir',
    opening: 'Récupération…',
    audioOnly: 'Écouter seulement',
    linkExpires: 'Ce lien vous appartient et cesse de fonctionner après quelques heures.',
    unavailable: 'Nous ne pouvons pas lire celui-ci pour vous.',
    state: {
      failed: 'Ce cours n’a pas été enregistré. Il n’y a aucune vidéo à revoir.',
      expired: 'Ce cours a dépassé la date jusqu’à laquelle nous gardons les enregistrements.',
      ready: 'Prêt',
    },
    scope: {
      class: 'Cours de classe',
      group: 'Groupe',
      'one-to-one': 'Cours particulier',
      invite: 'Appel sur invitation',
    },
  },

  teacherNav: {
    label: 'Enseignement',
    soon: 'Bientôt',
    comingSoon: 'Cet écran est en cours de création.',
    /* Voir en.ts : « bientôt » vient de nous, « verrouillé » attend le professeur. */
    locked: 'Verrouillé',
    lockedHint: 'Disponible une fois votre candidature approuvée.',
    overview: 'Aperçu',
    verification: 'Vérification',
    classes: 'Classes',
    timetable: 'Emploi du temps',
    lessons: 'Leçons',
    groups: 'Groupes',
    live: 'Passer en direct',
    recordings: 'Mes cours en direct',
    exams: 'Examens',
    reports: 'Bulletins',
    earnings: 'Revenus',
    messages: 'Messages',
    profile: 'Mon profil',
    group: {
      teaching: 'Enseignement',
      assessment: 'Évaluation',
      account: 'Compte',
    },
  },

  student: {
    tab: {
      subjects: 'Matières',
      home: 'Accueil',
      classes: 'Cours',
      work: 'Devoirs',
      practice: 'Entraînement',
      progress: 'Progrès',
      exams: 'Examens',
      messages: 'Messages',
      videos: 'Mes vidéos de cours',
    },
    navLabel: 'Menu principal',
    navMore: 'Plus',
    navMoreLabel: 'Autres destinations',

    account: {
      open: 'Votre compte',
      close: 'Fermer le menu du compte',
      profile: 'Votre profil',
      notifications: 'Ce dont on vous informe',
      help: 'Aide',
      tour: 'Faites-moi visiter',
    },

    home: {
      title: 'Accueil',
      greeting: 'Bonjour {name}',
      nothingTitle: 'Rien ne vous attend',
      nothingBody: 'Dès que vous aurez un cours ou un devoir, il apparaîtra ici.',
    },

    card: {
      nextSession: 'Votre prochain cours',
      homeworkDue: 'Devoirs à rendre',
      newlyGraded: 'Nouvellement corrigé',
      examCountdown: 'Votre examen',
      weakestTopic: 'À travailler un peu',
    },

    nextSession: {
      none: 'Aucun cours prévu pour l’instant',
      noneBody:
        'Votre enseignant ou l’équipe ClassConnect fixera votre prochain cours. Il apparaîtra ici.',
      with: 'avec {teacher}',
      join: 'Rejoindre le cours',
      opensIn: 'Vous pourrez entrer dans {time}',
      opensAt: 'Vous pourrez entrer à partir de {time}',
      ended: 'Ce cours est terminé',
      deviceCheck: 'Vérifiez votre caméra et le son',
    },

    homework: {
      none: 'Aucun devoir à rendre',
      noneBody: 'Quand un enseignant vous donne du travail, vous le trouverez ici.',
      due: 'À rendre avant le {date}',
      late: 'En retard',
      dueToday: 'À rendre aujourd’hui',
      dueTomorrow: 'À rendre demain',
    },

    graded: {
      none: 'Rien de corrigé pour l’instant',
      noneBody: 'Quand un enseignant corrige votre travail, cela apparaîtra ici.',
      score: '{score} sur {max}',
      unread: 'Nouveau',
    },

    exam: {
      daysLeft: 'Encore {count} jours',
      dayLeft: 'Encore 1 jour',
      today: 'Votre examen commence aujourd’hui',
      noDate: 'Aucune date d’examen enregistrée',
      noDateBody: 'Dès que votre date d’examen sera fixée, vous verrez le temps qu’il vous reste.',
    },

    readiness: {
      title: 'Où en est votre entraînement',
      estimateOnly:
        'Ceci indique où en est votre entraînement. Ce n’est pas une prévision de votre résultat à l’examen.',
      explain: 'Sur quoi cela repose',
      weakestTopic: 'C’est en {topic} que vous avez eu le plus de mal jusqu’ici.',
      weakestTopicAction: 'S’entraîner sur ce thème',
    },

    data: {
      estimate: 'Consomme environ {size} de données',
      audioOnly: 'Audio seulement — consomme beaucoup moins de données',
    },

    /* ---------------------------------------------------------------- *
     * Matières
     * ---------------------------------------------------------------- */
    subjects: {
      title: 'Tes matières',
      none: 'Pas encore de matières',
      noneBody: 'Dès que tes matières seront prêtes, elles apparaîtront ici avec ton emploi du temps.',
      timetable: 'Ton emploi du temps',
      thisWeek: 'Cette semaine',
      noTeacherYet: 'Enseignant en cours d’attribution',
      noTeacherYetBody: 'L’équipe ClassConnect cherche un enseignant pour cette matière.',
      taughtBy: 'Avec {teacher}',
      upcomingCount: '{count} à venir',
      recordingCount: '{count} à revoir',
      workCount: '{count} à rendre',
      noneThisWeek: 'Rien ce jour-là',
      openSubject: 'Ouvrir {subject}',
      yourClass: 'Ta classe',
    },

    weekday: {
      1: 'Lundi',
      2: 'Mardi',
      3: 'Mercredi',
      4: 'Jeudi',
      5: 'Vendredi',
      6: 'Samedi',
      7: 'Dimanche',
    },

    /* ---------------------------------------------------------------- *
     * Cours passés
     * ---------------------------------------------------------------- */
    attendance: {
      title: 'Ta présence',
      subtitle: 'Combien de tes cours tu as suivis.',
      none: 'Pas encore de cours',
      noneBody: 'Dès que tu auras eu des cours, ta présence apparaîtra ici.',
      overall: 'Au total',
      attendedOf: 'Tu as suivi {attended} cours sur {scheduled}',
      streak: '{count} cours d’affilée',
      streakOne: '1 cours pour l’instant',
      bySubject: 'Par matière',
      recent: 'Tes derniers cours',
      present: 'Présent',
      absent: 'Manqué',
      minutes: '{count} min',
      encourage: 'Tu as manqué un cours ? Tu peux encore regarder l’enregistrement.',
    },

    lessons: {
      /* Les trois sortes d’enregistrement, séparées car elles diffèrent. */
      sectionLessons: 'Mes cours',
      sectionGroups: 'Mes groupes',
      sectionInvited: 'Appels auxquels vous étiez invité',
      title: 'Mes vidéos de classe',
      subtitle:
        'Les cours de ta classe dans les matières que tu suis, tes groupes et les appels auxquels tu as été invité — y compris ceux que tu as manqués.',
      none: 'Pas encore de vidéos de classe',
      noneBody: 'Après ton premier cours, tu pourras le revoir ici.',
      watch: 'Revoir',
      watchAudio: 'Écouter seulement',
      attended: 'Tu étais présent',
      missed: 'Tu as manqué celui-ci',
      missedBody: 'Tu peux quand même regarder l’enregistrement.',
      minutesWatched: 'Tu es resté {count} minutes',
      processing: 'L’enregistrement sera prêt dans moins d’une heure',
      expired: 'Cet enregistrement n’est plus disponible',
      notRecorded: 'Ce cours n’a pas été enregistré',
      availableUntil: 'Disponible jusqu’au {date}',
      filterAll: 'Toutes les matières',
    },

    /* ---------------------------------------------------------------- *
     * Frais — un état, jamais une facture.
     * ---------------------------------------------------------------- */
    fees: {
      title: 'Frais de scolarité',
      none: 'Rien à afficher pour l’instant',
      noneBody: 'Ton plan de paiement apparaîtra ici une fois défini.',
      updates: 'Dernières mises à jour',
      registration: 'Inscription',
      registrationHint: 'Frais uniques pour s’inscrire, distincts des tranches ci-dessous.',
      stillToPay: 'Reste à payer',
      allPaid: 'Frais entièrement payés',
      paidOfTotal: '{paid} payés sur {total}',
      progressLabel: 'Part des frais déjà payée',
      thePlan: 'Le plan de paiement',
      guardianHandles:
        'Ton parent ou ton tuteur s’occupe des frais. Nous le prévenons de ce qui est à payer.',
      payInFull: 'Payé en une fois',
      threeInstalments: 'Payé en trois tranches',
      stage: 'Tranche {number}',
      stagePaid: 'Payée',
      stageDue: 'À payer maintenant',
      stageOverdue: 'En retard',
      stageUpcoming: 'Pas encore due',
      stageCancelled: 'Annulée',
      completed: 'Tous les frais sont payés — merci',
      inProgress: '{paid} tranches payées sur {total}',
      notStarted: 'Pas encore commencé',
      dueOn: 'À payer avant le {date}',
      paidOn: 'Payée le {date}',
      total: 'Total',
      outstanding: 'Reste à payer',
      pay: 'Payer maintenant',
    },

    /* ---------------------------------------------------------------- *
     * Évaluation
     * ---------------------------------------------------------------- */
    rating: {
      title: 'Évalue ton enseignant',
      forSubject: 'Comment se passe {subject} ?',
      anonymous: 'Ton enseignant ne saura jamais qui l’a évalué.',
      anonymousLong:
        'Les enseignants voient seulement leur note moyenne, et uniquement quand assez d’élèves ont répondu. Ils ne voient jamais qui a dit quoi, ni quand.',
      stars: '{count} sur 5',
      star1: 'Pas bien',
      star2: 'Peut mieux faire',
      star3: 'Correct',
      star4: 'Bien',
      star5: 'Très bien',
      commentLabel: 'Tu veux ajouter quelque chose ? (facultatif)',
      commentHelp: 'N’écris pas ton nom, ton numéro de téléphone ou ton adresse.',
      submit: 'Envoyer l’évaluation',
      submitted: 'Merci — ton évaluation a été envoyée',
      change: 'Modifier ton évaluation',
      changeWindow: 'Tu peux la modifier pendant 24 heures',
      yourRating: 'Tu as mis {stars} sur 5',
      notYet: 'Tu n’as pas encore évalué cet enseignant',
      noTeacher: 'Tu pourras évaluer ton enseignant dès qu’il sera attribué',
    },

    /* ---------------------------------------------------------------- *
     * Messages
     * ---------------------------------------------------------------- */

    classes: {
      title: 'Cours',
      upcoming: 'À venir',
      past: 'Terminés',
      none: 'Aucun cours pour l’instant',
      noneBody: 'Votre emploi du temps apparaîtra ici dès que vos cours seront fixés.',
      exportCalendar: 'Ajouter à votre agenda',
      cancel: 'Annuler ce cours',
      cancelFree: 'Vous pouvez annuler ce cours et le garder pour une autre fois.',
      cancelCharged:
        'Il reste moins de {hours} heures avant ce cours. Si vous annulez maintenant, ce cours est perdu.',
      recording: 'Revoir l’enregistrement',
      recordingUntil: 'Vous pouvez le revoir jusqu’au {date}',
      recordingPending: 'L’enregistrement sera prêt d’ici une heure',
      bookingByStaff: 'L’équipe ClassConnect fixe vos cours pour vous.',
      book: 'Réserver un cours',
      /** §1 — les quatre vues, en sélecteur segmenté dans Cours. */
      view: {
        live: 'En direct',
        upcoming: 'À venir',
        attended: 'Suivis',
        missed: 'Manqués',
      },
      liveNow: 'En direct maintenant',
      elapsed: '{minutes} min écoulées',
      participants: '{count} personnes en cours',
      join: 'Rejoindre le cours',
      joinOpensIn: 'Vous pourrez entrer dans {time}',
      joinClosed: 'Ce cours est terminé',
      nextUp: 'Prochain cours',
      noneLive: 'Aucun cours en ce moment',
      noneLiveBody: 'Dès qu’un cours commence, le bouton pour entrer apparaît ici.',
      noneUpcoming: 'Aucun cours prévu pour l’instant',
      noneAttended: 'Aucun cours terminé pour l’instant',
      noneAttendedBody: 'Les cours que vous avez suivis apparaîtront ici, avec ce que vous y avez fait.',
      noneMissed: 'Vous n’avez manqué aucun cours',
      noneMissedBody: 'Rien à rattraper. Continuez ainsi.',
      oneToOne: 'Vous et votre enseignant, seuls',
      group: 'Cours en groupe',
      minutes: '{count} min',
      attendedMinutes: 'Vous y êtes resté {minutes} min',
      /**
       * §1.1 — formulation neutre. Trois des quatre raisons ne viennent pas de
       * l’élève, et dire à un enfant qu’il a « manqué » un cours annulé par son
       * enseignant affirme quelque chose de faux à son sujet.
       */
      miss: {
        learner_no_show: 'Vous n’avez pas rejoint ce cours.',
        teacher_cancelled: 'Votre enseignant a annulé ce cours.',
        teacher_no_show: 'Votre enseignant n’est pas venu.',
        learner_cancelled: 'Vous avez annulé ce cours.',
        attended_none: 'Ce cours a eu lieu, mais vous n’y étiez pas.',
      },
      entitlementRestored: 'Votre cours vous a été rendu — celui-ci n’a pas été décompté.',
      entitlementUsed: 'Ce cours a été décompté.',
      /** §1.2 — la vue détaillée. */
      detail: {
        title: 'Détail du cours',
        attendance: 'Votre présence',
        firstJoin: 'Entré à',
        lastLeave: 'Sorti à',
        totalMinutes: 'Temps de connexion total',
        chat: 'Discussion du cours',
        noChat: 'Rien n’a été écrit dans la discussion.',
        files: 'Fichiers partagés',
        noFiles: 'Aucun fichier partagé.',
        homework: 'Travail donné pendant ce cours',
        noHomework: 'Aucun travail donné.',
        teacher: 'Votre enseignant',
        back: 'Retour aux cours',
      },
      /**
       * §1.3 — micro et caméra, rapportés de façon neutre. Jamais notés, jamais
       * classés, jamais montrés aux autres élèves.
       */
      stream: {
        title: 'Votre micro et votre caméra',
        mic: 'Micro',
        camera: 'Caméra',
        on_throughout: 'Allumé pendant tout le cours',
        on_partly: 'Allumé pendant {minutes} min',
        off_whole_session_by_choice: 'Éteint pendant tout le cours',
        /**
         * FR-LIV-009 coupe la vidéo de l’élève quand le débit baisse. Le dire est
         * obligatoire : l’élève ne s’est pas caché, c’est la plateforme qui l’a fait.
         */
        off_whole_session_by_system: 'Éteinte — coupée automatiquement pour économiser les données',
        explain: 'Ceci est là pour que votre famille et vous sachiez ce qui s’est passé. Ce n’est pas une note et personne n’est classé là-dessus.',
      },
      /** §2 — demander la parole. C’est toujours l’enseignant qui décide. */
      speak: {
        ask: 'Demander la parole',
        asked: 'Votre main est levée — en attente de votre enseignant',
        approved: 'Votre enseignant vous donne la parole',
        dismissed: 'Votre enseignant n’a pas pris votre main cette fois',
        lower: 'Baisser la main',
        stop: 'Arrêter de parler',
        full: 'Le nombre maximum de personnes parle déjà. Réessayez dans un instant.',
        tooMany: 'Vous avez déjà demandé plusieurs fois. Laissez un moment à votre enseignant.',
        explain: 'Votre enseignant doit accepter avant que votre caméra et votre micro passent devant toute la classe.',
      },
    },

    /** §3 — cours enregistrés. */
    recordings: {
      title: 'Cours enregistrés',
      subtitle: 'Revoir un cours',
      none: 'Aucun enregistrement pour l’instant',
      noneBody: 'Quand un cours que vous avez suivi est enregistré, il apparaîtra ici.',
      count: '{count} enregistrement',
      countPlural: '{count} enregistrements',
      recordedOn: 'Enregistré le {date}',
      duration: '{minutes} min',
      /** §3 : un enregistrement qui disparaît sans prévenir en août est un ticket de support. */
      availableUntil: 'Disponible jusqu’au {date}',
      expiringSoon: 'Plus que {days} jours pour le regarder',
      /** NFR-BAN-002 : annoncer le coût avant de le dépenser. */
      size: '{size} de données',
      audioOnly: 'Écouter seulement — beaucoup moins de données',
      audioSize: 'Écouter seulement ({size})',
      watch: 'Regarder',
      resume: 'Reprendre à {time}',
      backToSubjects: 'Toutes les matières',
    },

    /** §4 — examens. */
    exams: {
      title: 'Examens',
      subtitle: 'Passer un examen, et revoir tous ceux que vous avez passés',
      available: 'Prêts à passer',
      history: 'Vos examens jusqu’ici',
      none: 'Aucun examen pour l’instant',
      noneBody: 'Quand votre enseignant donne un examen, il apparaîtra ici.',
      noneHistory: 'Vous n’avez encore passé aucun examen',
      start: 'Commencer cet examen',
      resume: 'Reprendre cet examen',
      durationMin: '{minutes} minutes',
      questions: '{count} questions',
      setBy: 'Donné par {teacher}',
      markedBy: 'Corrigé par {teacher}',
      takenOn: 'Passé le {date}',
      timeTaken: 'Vous y avez passé {minutes} min',
      score: '{score} sur {total}',
      percentage: '{percent} %',
      cohortMean: 'Moyenne de la classe {percent} %',
      byTopic: 'Vos résultats, thème par thème',
      trend: 'Vos notes au fil du temps',
      /** FR-ASM-003 : une note partielle présentée comme définitive est un mensonge. */
      awaitingMarking: 'En attente de la correction des réponses rédigées par votre enseignant',
      awaitingMarkingBody: 'La note ci-dessous ne compte que les questions que le système peut corriger.',
      /** FR-ASM-010 : une note modifiée est affichée comme telle. */
      overridden: 'Votre enseignant a ajusté cette note',
      overriddenBy: 'Ajustée par {teacher} le {date}',
      filterSubject: 'Matière',
      filterAll: 'Toutes les matières',
      messageTeacher: 'Écrire à cet enseignant',

      /** §4.2 — le contrôle avant l’examen. */
      gate: {
        title: 'Avant de commencer',
        deviceCheck: 'Vérifiez votre micro et votre caméra',
        micOk: 'Le micro fonctionne',
        micBad: 'Nous n’entendons pas votre micro',
        cameraOk: 'La caméra fonctionne',
        cameraBad: 'Nous ne voyons pas votre caméra',
        bandwidth: 'Votre connexion : {kbps} kbps',
        retry: 'Vérifier à nouveau',
        /** §4.2.3 — langage clair, dans les deux langues, avant le consentement. */
        disclosureTitle: 'Ce qui est enregistré pendant cet examen',
        disclosureMic: 'Votre micro reste allumé pendant tout l’examen, et le son est écouté pour détecter les bruits de fond.',
        disclosureCamera: 'Votre caméra reste allumée pendant tout l’examen.',
        disclosureNoise: 'Si un bruit fort est détecté trois fois, l’examen s’arrêtera et une personne de ClassConnect examinera ce qui s’est passé.',
        disclosureStored: 'De courts extraits sonores et des images de votre caméra sont conservés {days} jours.',
        disclosureWho: 'Seuls votre enseignant, votre parent ou tuteur, et le personnel de ClassConnect peuvent les voir.',
        acknowledge: 'J’ai lu ceci et je suis prêt à commencer',
        /** §4.2.1 — pas de consentement ne veut pas dire pas d’examen. */
        consentNeeded: 'Votre parent ou tuteur doit donner son accord avant un examen surveillé',
        consentNeededBody: 'On le lui demandera une seule fois. En attendant, vous pouvez passer cet examen sans surveillance, ou demander à votre enseignant de le surveiller avec vous.',
        takeUnproctored: 'Passer sans surveillance',
        cannotStart: 'Vous ne pouvez pas encore commencer cet examen',
      },

      /** §4.3 / §4.4 — le déroulement. */
      runner: {
        remaining: 'Temps restant',
        warningMinutes: 'Il reste {minutes} minutes',
        saved: 'Enregistré',
        saving: 'Enregistrement…',
        savedAt: 'Vos réponses ont été enregistrées à {time}',
        question: 'Question {number} sur {total}',
        section: 'Partie {name}',
        previous: 'Précédent',
        next: 'Suivant',
        submit: 'Terminer et rendre',
        submitConfirm: 'Rendre votre copie ? Vous ne pourrez plus modifier vos réponses.',
        autoSubmitted: 'Le temps est écoulé, vos réponses ont donc été rendues automatiquement.',
        /** FR-ASM-007 : ici, la reconnexion est le cas normal, pas l’exception. */
        reconnecting: 'Connexion perdue — vos réponses sont en sécurité',
        reconnectingBody: 'Nous vous reconnectons. Rien de ce que vous avez écrit n’est perdu.',
        resumed: 'Vous êtes de retour. Vos réponses ont été conservées et le temps a continué.',
        /** §4.3 — l’échelle des alertes sonores. */
        noiseWarning: 'Nous entendons du bruit de fond. Trouvez un endroit plus calme si vous le pouvez.',
        noiseFinal: 'C’est le dernier avertissement — encore une fois et l’examen s’arrêtera.',
        micRequired: 'Votre micro doit rester allumé',
        cameraRequired: 'Votre caméra doit rester allumée',
        streamGrace: 'Rallumez-la dans les {seconds} secondes, sinon l’examen s’arrêtera.',
        stopped: 'L’examen s’est arrêté',
        stoppedNoise: 'Du bruit de fond a été détecté trois fois, l’examen s’est donc arrêté.',
        stoppedMic: 'Votre micro était éteint, l’examen s’est donc arrêté.',
        stoppedCamera: 'Votre caméra était éteinte, l’examen s’est donc arrêté.',
        /**
         * Le système arrête l’épreuve. Il ne corrige pas la copie — FR-AI-005 et
         * FR-ASM-007 survivent tous deux à l’arrêt, et un élève à qui on ne dit
         * pas que ses réponses ont été gardées supposera qu’elles sont perdues.
         */
        stoppedKept: 'Tout ce que vous avez répondu a été rendu et enregistré.',
        stoppedReview: 'Une personne de ClassConnect examinera ce qui s’est passé et décidera. Vous serez informé du résultat.',
        stoppedRespond: 'Vous pouvez nous dire ce qui se passait',
        yourStatement: 'Que se passait-il ?',
        sendStatement: 'Envoyer',
        statementSent: 'Merci — ceci sera lu en même temps que l’enregistrement.',
      },

      /** §4.1 — une copie en cours d’examen. */
      review: {
        flagged: 'En cours d’examen',
        flaggedBody: 'Cet examen est entre les mains d’une personne de ClassConnect. Votre note n’est pas encore définitive.',
        outcomeUpheld: 'Examiné — votre résultat est maintenu',
        outcomeDismissed: 'Examiné — il n’y avait rien d’anormal',
        outcomeVoided: 'Examiné — cette tentative ne compte pas',
      },
    },

    /** §5 — messages. */
    messages: {
      title: 'Messages',
      subtitle: 'Échanger avec vos enseignants et avec ClassConnect',
      none: 'Aucun message pour l’instant',
      noneBody: 'Écrivez à un enseignant depuis son cours, ou à ClassConnect ci-dessous.',
      newThread: 'Écrire un message',
      toTeacher: 'Écrire à un enseignant',
      toSupport: 'Écrire à ClassConnect',
      teachers: 'Vos enseignants',
      support: 'ClassConnect',
      write: 'Écrire un message',
      send: 'Envoyer',
      sending: 'Envoi…',
      you: 'Vous',
      today: 'Aujourd’hui',
      yesterday: 'Hier',
      /** §5.4 — la pierre tombale, visible par les deux personnes. */
      deleted: 'Ce message a été supprimé.',
      edited: 'modifié',
      /** §5.2 — dire pourquoi le texte a changé, plutôt que de le modifier en silence. */
      redacted: 'Les numéros de téléphone, adresses e-mail et autres coordonnées sont retirés automatiquement.',
      redactedNotice: 'Des coordonnées ont été retirées de votre message. Tout ce qui se passe sur ClassConnect reste sur ClassConnect.',
      /** §5.3 — pièces jointes. */
      attach: 'Ajouter un fichier',
      attachPhoto: 'Photo',
      attachVideo: 'Vidéo',
      attachFile: 'Fichier',
      attachVoice: 'Message vocal',
      recording: 'Enregistrement… {seconds}s',
      stopRecording: 'Arrêter',
      voiceMax: 'Les messages vocaux peuvent durer jusqu’à {seconds} secondes',
      attachmentSize: '{size}',
      /** FR-FIL-001 : rien n’est téléchargeable avant d’avoir passé l’analyse. */
      scanning: 'Vérification du fichier…',
      scanFailed: 'Ce fichier n’a pas passé notre contrôle de sécurité et n’a pas été envoyé.',
      tooLarge: 'Ce fichier est trop volumineux. La limite est de {size}.',
      typeNotAllowed: 'Ce type de fichier ne peut pas être envoyé.',
      permanent: 'Un message envoyé ne peut pas être supprimé.',
      permanentLong:
        'Une fois envoyé, ton message reste dans la conversation. Ni toi ni ton enseignant ne pouvez le supprimer. C’est pour la sécurité de tous.',
      teacherUnavailable:
        'Cet enseignant n’est pas disponible pour le moment. Contacte l’aide ClassConnect.',
      closed: 'Cette conversation est fermée. Tu peux encore la lire.',
      empty: 'Écris d’abord quelque chose',
      openThread: 'Ouvrir la conversation avec {name}',
      placeholder: 'Écris ton message',
      compose: 'Écrire un message',
      attachmentTooBig: 'Les fichiers doivent faire moins de {size}',
      newMessage: 'Nouveau message',
      chooseContact: 'À qui veux-tu écrire ?',
      searchContacts: 'Cherche parmi tes enseignants',
      searchNoResults: 'Personne ne correspond',
      searchNoResultsBody: 'Tu peux écrire aux enseignants qui te font cours, et à l’aide ClassConnect.',
      onlyYourTeachers: 'Tu peux écrire à tes propres enseignants et à l’aide ClassConnect.',
      startWith: 'Écrire à {name}',
      openExisting: 'Ouvrir la conversation',
      uploading: 'Envoi…',
      attachmentReady: 'Prêt',
      unreadCount: '{count} messages non lus',
      unreadOne: '1 message non lu',
      attachmentPending: 'Vérification en cours…',
      voiceNote: 'Note vocale',
      recordVoice: 'Enregistrer une note vocale',
      voiceUnsupported: 'Les notes vocales ont besoin du micro. Vérifie les réglages de ton navigateur.',
      openImage: 'Ouvrir {name}',
      preview: 'Aperçu',
      attachmentBlocked: 'Ce fichier n’a pas pu être envoyé',
      previewOpen: 'Ouvrir pour vérifier',
      attachmentTimeout: 'Cela a pris trop de temps. Vérifie ta connexion et réessaie.',
      reportConcern: 'Signaler un problème dans cette conversation',
    },

    work: {
      title: 'Devoirs',
      toDo: 'À faire',
      submitted: 'Rendus',
      graded: 'Corrigés',
      materials: 'Lectures et fiches',
      noneToDo: 'Rien à faire pour le moment',
      noneToDoBody: 'Quand un enseignant vous donne du travail, cela apparaîtra ici.',
      noneSubmitted: 'Rien en attente de correction',
      noneSubmittedBody:
        'Le travail que vous rendez reste ici jusqu’à ce que votre enseignant le corrige.',
      noneGraded: 'Rien de corrigé pour l’instant',
      noneGradedBody: 'Vos notes et les remarques de vos enseignants apparaîtront ici.',
      noneMaterials: 'Aucune fiche pour l’instant',
      noneMaterialsBody: 'Les fiches et lectures de vos enseignants apparaîtront ici.',
      savedOffline: 'Enregistré pour une lecture hors connexion',
      /* Voir en.ts : « garder », pas « télécharger » — la promesse est de pouvoir relire sans réseau. */
      openMaterial: 'Garder pour lire hors connexion',
      openingMaterial: 'Récupération…',
      materialFailed: 'Impossible d’ouvrir ce fichier. Réessayez dans un instant.',
    },

    practice: {
      title: 'Entraînement',
      quizzes: 'Quiz',
      mocks: 'Examens blancs',
      pastPapers: 'Anciens sujets',
      none: 'Rien à travailler pour l’instant',
      noneBody:
        'Les quiz et les anciens sujets apparaîtront ici au fur et à mesure que vos enseignants les ajoutent.',
      needsConnection: 'Vous devez être connecté pour commencer',
      needsConnectionBody:
        'Une épreuve chronométrée ne peut pas démarrer hors connexion. Réessayez dès que vous avez du réseau.',
    },

    progress: {
      title: 'Progrès',
      attendance: 'Cours suivis',
      homework: 'Devoirs rendus',
      onTime: 'Rendus dans les temps',
      scores: 'Vos notes',
      strengths: 'Ce qui se passe bien',
      weaknesses: 'Ce qu’il faut travailler',
      teacherComments: 'Ce que disent vos enseignants',
      revisionPlan: 'Votre plan de révision',
      none: 'Rien à afficher pour l’instant',
      noneBody:
        'Dès que vous aurez suivi des cours et rendu des devoirs, vos progrès apparaîtront ici.',
    },

    frozen: {
      minorTitle: 'Certaines choses sont en pause',
      minorBody:
        'Un paiement est nécessaire avant que vos cours reprennent. Nous avons prévenu votre parent ou votre tuteur : vous n’avez rien à faire.',
      minorStillOpen: 'Vous pouvez toujours utiliser ceci',
      minorStillOpenBody:
        'Votre emploi du temps, les devoirs déjà corrigés et tout ce que vous avez enregistré pour lire hors connexion.',
      adultTitle: 'Vos cours sont en pause',
      adultBody:
        'Un paiement reste à régler sur votre compte. Dès qu’il sera réglé, tout refonctionnera aussitôt.',
      adultPay: 'Effectuer un paiement',
      adultAmount: '{amount} FCFA à régler',
      blockedAction: 'En pause tant que le paiement n’est pas réglé.',
      contactSupport: 'Obtenir de l’aide',
      resolvedTitle: 'Tout est réactivé',
      resolvedBody: 'Merci. Vos cours et vos devoirs sont de nouveau accessibles.',
    },

    report: {
      concern: 'Signaler un problème',
      concernHint: 'Dites-nous si quelque chose ici vous inquiète. Une personne le lira.',
    },

    recording: {
      disclosureBooking: 'Ce cours sera enregistré.',
      disclosureJoin: 'Ce cours est en cours d’enregistrement.',
      indicator: 'Enregistrement',
    },

    error: {
      loadTitle: 'Nous n’avons pas pu charger ceci',
      loadBody: 'C’est souvent la connexion. Vérifiez votre réseau et réessayez.',
      retry: 'Réessayer',
      offlineTitle: 'Vous êtes hors connexion',
      offlineBody: 'Nous vous montrerons ceci dès que vous aurez du réseau.',
    },

    unit: {
      minutes: '{count} min',
      questions: '{count} questions',
      oneQuestion: '1 question',
      attempts: '{used} essais sur {allowed} utilisés',
      attemptsLeft: 'Encore {count} essais',
      best: 'Meilleur résultat {percent} %',
      percent: '{value} %',
      outOf: '{value} sur {total}',
      paperNo: 'Épreuve {number}',
      today: 'Aujourd’hui',
      tomorrow: 'Demain',
      yesterday: 'Hier',
      inMinutes: 'dans {count} min',
      inHours: 'dans {count} h',
      inDays: 'dans {count} jours',
    },

    sessionStatus: {
      scheduled: 'À venir',
      in_progress: 'En cours',
      completed: 'Terminé',
      cancelled_by_learner: 'Vous avez annulé ce cours',
      cancelled_by_teacher: 'Votre enseignant a annulé ce cours',
      no_show_teacher: 'Votre enseignant n’est pas venu',
      no_show_learner: 'Vous avez manqué ce cours',
      aborted: 'Interrompu',
      disputed: 'En cours d’examen',
      voided: 'Annulé',
    },

    readinessDriver: {
      practice: 'Vos résultats d’entraînement',
      homework: 'Les devoirs que vous avez terminés',
      attendance: 'Les cours que vous avez suivis',
    },

    tour: {
      skip: 'Passer',
      next: 'Suivant',
      done: 'C’est compris',
      restart: 'Refaire la visite',
    },
  },
};
