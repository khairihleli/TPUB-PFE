import { CONTACT } from "@/content/site";

/**
 * FAQ content (brief §8.1 FAQ, extended with the objections of §4 and the guardrails of §6).
 * Answers are plain text so the same source feeds the accordions and the FAQPage JSON-LD.
 */

export interface FaqEntry {
  question: string;
  answer: string;
  link?: { label: string; href: string };
}

export interface FaqTheme {
  /** Anchor id (#statut…). */
  id: string;
  title: string;
  intro: string;
  entries: readonly FaqEntry[];
}

export const FAQ_THEMES: readonly FaqTheme[] = [
  {
    id: "statut",
    title: "Statut et démarrage",
    intro: "Où en est ZELQANE, et ce que vous pouvez faire dès aujourd'hui.",
    entries: [
      {
        question: "ZELQANE est-il déjà en service ?",
        answer:
          "ZELQANE est en phase de conception. Ce site présente la plateforme telle qu'elle est conçue : zones, réservation, contrôle des contenus, journal de diffusion. Vous pouvez dès maintenant créer un compte annonceur et préparer vos campagnes. La disponibilité des emplacements s'affiche dans votre espace.",
        link: { label: "Voir le fonctionnement", href: "/fonctionnement" },
      },
      {
        question: "Que puis-je faire en créant un compte aujourd'hui ?",
        answer:
          "L'inscription crée un compte annonceur et un dossier examiné par ZELQANE. Vous pouvez déjà explorer les zones et préparer une campagne en brouillon : objectif, budget en dinars, période et heures de diffusion.",
        link: { label: "Créer mon compte annonceur", href: "/inscription" },
      },
      {
        question: "Pourquoi mon dossier annonceur est-il examiné ?",
        answer:
          "Pour protéger l'espace public, chaque compte annonceur est examiné par ZELQANE avant la diffusion de sa première campagne. Le réseau est conçu pour des annonceurs vérifiés.",
      },
      {
        question: "Je suis une agence ou une marque nationale : par où commencer ?",
        answer:
          "Écrivez-nous. Nous partons de vos objectifs, de vos cibles et de vos zones pour construire un plan média, et nous précisons ce qui sera prouvé et ce qui sera estimé.",
        link: { label: "Demander un plan média", href: "/contact?besoin=plan-media#formulaire" },
      },
    ],
  },
  {
    id: "prix",
    title: "Prix et achat",
    intro: "Ce que vous achetez, et les critères qui en fixent le prix.",
    entries: [
      {
        question: "Qu'est-ce que j'achète exactement ?",
        answer:
          "Du temps de diffusion : des créneaux sur des emplacements, dans des zones, pour une période et des heures données. Un panneau vend une surface. Un écran vend du temps devant un flux de personnes.",
      },
      {
        question: "Comment le prix est-il établi ?",
        answer:
          "Selon l'emplacement, le format et la visibilité de l'écran, la pression (durée et fréquence dans la boucle), la période et la saison. Pour les agences et les marques, ZELQANE répond par un plan média plutôt que par une grille générique.",
        link: { label: "Les critères qui font le prix", href: "/tarifs" },
      },
      {
        question: "Pourquoi n'y a-t-il pas de grille tarifaire publique ?",
        answer:
          "Il n'existe pas de grille unique pour l'affichage numérique : deux écrans au même tarif peuvent offrir des contacts réels très différents. ZELQANE préfère rendre explicites les critères qui font le prix et construire une proposition à partir de vos objectifs.",
      },
      {
        question: "Le coût affiché dans mon espace est-il définitif ?",
        answer:
          "Non. Lors de la réservation, la plateforme affiche un coût estimé, libellé « estimation indicative ». Il s'agit d'une valeur provisoire, non issue d'une mesure.",
      },
      {
        question: "Puis-je payer en ligne ?",
        answer:
          "Paiement en ligne : bientôt disponible. Les montants affichés dans votre espace sont indicatifs.",
      },
    ],
  },
  {
    id: "mesure",
    title: "Mesure et preuves",
    intro: "Ce que la plateforme prouve, ce qu'elle estime, et ce qu'elle ne revendique pas.",
    entries: [
      {
        question: "Le journal de diffusion, est-ce une mesure d'audience ?",
        answer:
          "Non. Il prouve qu'un écran a diffusé votre contenu, à quel moment et pendant combien de temps. L'audience est une autre couche : quand elle est estimée, elle l'est de façon anonyme et agrégée, avec sa méthode, et ZELQANE ne l'assimile jamais à une diffusion.",
      },
      {
        question: "Qu'est-ce qui est observé, qu'est-ce qui est estimé ?",
        answer:
          "Sont observés : la disponibilité de chaque écran (actif, en maintenance, hors ligne), les diffusions journalisées (horodatage, écran, zone, campagne, durée) et, sur les canaux connectés, les clics et interactions. L'audience et l'exposition sont estimées ou modélisées. L'effet commercial nécessite un groupe témoin et n'est pas revendiqué par défaut.",
        link: { label: "L'échelle de confiance", href: "/fonctionnement" },
      },
      {
        question: "Un écran hors ligne compte-t-il comme une diffusion ?",
        answer:
          "Non. L'état technique de chaque écran est suivi, et un écran hors ligne n'est pas compté comme diffusant.",
      },
      {
        question: "Les « vues » de mon tableau de bord sont-elles une audience ?",
        answer:
          "Non. Elles correspondent aux passages enregistrés dans le journal de diffusion, pas à des personnes. Les vues et les coûts estimés sont toujours présentés comme une estimation indicative.",
      },
      {
        question: "Les passants sont-ils identifiés ?",
        answer:
          "Non. La plateforme n'est pas conçue pour identifier ni suivre individuellement les passants. Les indicateurs d'audience, lorsqu'ils existent, sont anonymes, agrégés et toujours présentés avec leur méthode.",
      },
    ],
  },
  {
    id: "moderation",
    title: "Modération des contenus",
    intro: "Le double contrôle appliqué à chaque campagne avant sa mise à l'antenne.",
    entries: [
      {
        question: "Comment mes contenus sont-ils contrôlés ?",
        answer:
          "Par une analyse IA (conformité, risque et qualité notés sur 100, avec recommandations), puis par la validation d'un expert ZELQANE. Si la campagne doit être corrigée, vous la modifiez et la soumettez à nouveau.",
      },
      {
        question: "L'IA décide-t-elle seule ?",
        answer:
          "Non. L'IA assiste, une personne décide. Aucune campagne n'est diffusée sans la validation d'un expert ZELQANE, et chaque décision est motivée et enregistrée. L'analyse aide à repérer les points sensibles, elle ne garantit pas à elle seule l'absence de tout contenu problématique.",
      },
      {
        question: "Quels contenus sont refusés ?",
        answer:
          "Les contenus trompeurs ou mensongers (par exemple « gratuit garanti » ou de fausses promesses), offensants, discriminatoires ou illégaux. Une qualité rédactionnelle insuffisante ou une incohérence entre budget et objectif sont signalées.",
        link: { label: "La charte des contenus", href: "/fonctionnement" },
      },
      {
        question: "Que se passe-t-il si ma campagne doit être corrigée ?",
        answer:
          "Consultez les points relevés et la recommandation dans votre espace, modifiez votre campagne en conséquence, puis soumettez-la à nouveau. En cas de refus par un expert ZELQANE, le motif est indiqué et vos créneaux sont libérés.",
      },
    ],
  },
  {
    id: "ciblage",
    title: "Ciblage et diffusion",
    intro: "Zones, créneaux, réservations et messages d'intérêt général.",
    entries: [
      {
        question: "Puis-je cibler un quartier précis ?",
        answer:
          "Oui, la plateforme est conçue pour un ciblage par zone géographique et par plage horaire quotidienne. Une campagne peut viser plusieurs zones.",
        link: { label: "Réseau & zones", href: "/reseau" },
      },
      {
        question: "Puis-je choisir mes heures de diffusion ?",
        answer:
          "Oui. Chaque campagne définit une période (dates de début et de fin) et une plage horaire quotidienne. Votre cible de 8 h n'est pas celle de 22 h.",
      },
      {
        question: "Comment la double réservation est-elle évitée ?",
        answer:
          "La plateforme vérifie les conflits au moment de la réservation : le créneau est bloqué temporairement, puis confirmé à la validation de la campagne. Si la campagne est refusée, les créneaux sont annulés.",
      },
      {
        question: "Que se passe-t-il si un message d'intérêt général doit être diffusé ?",
        answer:
          "Le moteur de diffusion est conçu pour faire passer un message prioritaire avant toute publicité dans la zone concernée, puis reprendre la programmation normale à la fin du message. Ces messages sont gérés exclusivement par l'équipe ZELQANE.",
      },
      {
        question: "Puis-je importer mes créations moi-même ?",
        answer: `L'import de créations en libre-service sera bientôt disponible. En attendant, transmettez vos fichiers à ${CONTACT.email} : votre conseiller ZELQANE récupère le visuel après validation.`,
      },
    ],
  },
];
