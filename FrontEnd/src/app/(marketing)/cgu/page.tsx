import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, type LegalSection } from "@/components/contact/legal-document";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description:
    "Règles d'utilisation du site et de l'espace annonceur TPUB : compte, campagnes, réservations, contrôle des contenus et estimations. Document en cours de validation juridique.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "objet",
    title: "Objet",
    content: (
      <p>
        Les présentes conditions encadrent l&apos;utilisation du site TPUB et de l&apos;espace
        annonceur, qui permet de préparer des campagnes d&apos;affichage numérique extérieur :
        création de campagne, réservation de créneaux par zone et par emplacement, contrôle des
        contenus, validation et suivi.
      </p>
    ),
  },
  {
    id: "statut",
    title: "Statut de la plateforme",
    content: (
      <>
        <p>
          TPUB est au stade de la conception. Les fonctionnalités, emplacements et parcours décrits
          correspondent à la plateforme telle qu&apos;elle est conçue et peuvent évoluer.
        </p>
        <ul>
          <li>
            Le paiement en ligne n&apos;est pas disponible : les montants affichés sont indicatifs.
          </li>
          <li>
            Le dépôt de fichiers de création en libre-service n&apos;est pas encore disponible : vos
            visuels sont transmis à TPUB.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "compte",
    title: "Compte annonceur",
    content: (
      <>
        <p>
          L&apos;inscription crée un compte annonceur. Vous vous engagez à fournir des informations
          exactes sur vous et sur votre société, et à les tenir à jour.
        </p>
        <p>
          Pour protéger l&apos;espace public, chaque compte annonceur est examiné par TPUB avant la
          diffusion de sa première campagne. TPUB peut refuser ou suspendre un compte dont les
          informations sont inexactes ou dont l&apos;usage est contraire aux présentes conditions.
        </p>
        <p>
          Vos identifiants sont personnels. Votre session expire au plus tard après 24 heures :
          reconnectez-vous pour continuer.
        </p>
      </>
    ),
  },
  {
    id: "campagnes",
    title: "Campagnes et réservations",
    content: (
      <ul>
        <li>
          Une campagne démarre en brouillon : vous pouvez la modifier ou la supprimer tant
          qu&apos;elle n&apos;est pas soumise.
        </li>
        <li>
          Une réservation bloque temporairement un créneau sur un emplacement. Elle est confirmée à
          la validation de la campagne et libérée en cas de refus.
        </li>
        <li>
          La plateforme vérifie les conflits : un emplacement déjà réservé sur une période ne peut
          pas l&apos;être une seconde fois.
        </li>
        <li>Une campagne soumise ne peut plus être modifiée pendant son examen.</li>
      </ul>
    ),
  },
  {
    id: "contenus",
    title: "Contrôle des contenus",
    content: (
      <>
        <p>
          Les écrans sont situés dans l&apos;espace public. Chaque campagne soumise est analysée par
          IA, puis validée ou refusée par un expert TPUB. L&apos;IA assiste, une personne décide ;
          les décisions sont enregistrées.
        </p>
        <p>Sont refusés notamment :</p>
        <ul>
          <li>
            les contenus trompeurs ou mensongers (par exemple « gratuit garanti », fausses
            promesses) ;
          </li>
          <li>les contenus offensants, discriminatoires ou illégaux.</li>
        </ul>
        <p>
          Peuvent être signalées pour une vérification humaine : une formulation ambiguë ou un
          budget incohérent avec l&apos;objectif. Une campagne refusée à l&apos;analyse ne peut pas
          être soumise à nouveau telle quelle : dupliquez-la, corrigez la copie, puis soumettez-la.
        </p>
      </>
    ),
  },
  {
    id: "interet-general",
    title: "Messages d'intérêt général",
    content: (
      <p>
        Le moteur de diffusion est conçu pour donner la priorité aux messages d&apos;intérêt général
        : lorsqu&apos;un tel message est actif dans une zone, il remplace temporairement la
        programmation publicitaire des écrans concernés, puis la diffusion normale reprend. Ces
        messages sont gérés exclusivement par l&apos;équipe TPUB.
      </p>
    ),
  },
  {
    id: "estimations",
    title: "Estimations et statistiques",
    content: (
      <>
        <p>
          Les coûts et vues estimés affichés dans l&apos;espace annonceur sont des estimations
          indicatives : ils ne constituent ni un devis, ni un engagement de résultat.
        </p>
        <p>
          Le journal de diffusion prouve qu&apos;un écran a diffusé un contenu, à quel moment et
          pendant combien de temps. Il ne constitue pas une mesure d&apos;audience.
        </p>
      </>
    ),
  },
  {
    id: "responsabilites",
    title: "Vos engagements",
    content: (
      <ul>
        <li>
          Vous garantissez disposer des droits nécessaires sur les textes, images, vidéos, marques
          et éléments utilisés dans vos campagnes.
        </li>
        <li>
          Vous vous engagez à ce que vos contenus respectent la réglementation applicable et la
          charte des contenus décrite ci-dessus.
        </li>
        <li>
          Vous vous abstenez de toute utilisation susceptible de perturber le fonctionnement ou la
          sécurité de la plateforme.
        </li>
      </ul>
    ),
  },
  {
    id: "propriete",
    title: "Propriété intellectuelle",
    content: (
      <p>
        La plateforme, son nom, son logo et ses contenus restent la propriété de TPUB et du groupe
        Tukhnanutha. Vos créations restent votre propriété ; vous autorisez TPUB à les reproduire et
        les diffuser dans le cadre des campagnes validées.
      </p>
    ),
  },
  {
    id: "evolution",
    title: "Évolution des conditions",
    content: (
      <p>
        Ces conditions peuvent être modifiées, notamment à l&apos;issue de leur validation juridique
        et lors de la mise en service de la plateforme. La version en vigueur est celle publiée sur
        cette page.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Pour toute question sur ces conditions : {CONTACT.email}, {CONTACT.phone}, ou le{" "}
        <Link href="/contact">formulaire de contact</Link>. Voir aussi les{" "}
        <Link href="/mentions-legales">mentions légales</Link> et la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    ),
  },
];

export default function CguPage() {
  return (
    <LegalDocument
      href="/cgu"
      label="CGU"
      title="Conditions générales d'utilisation"
      lede="Les règles qui encadrent l'utilisation du site et de l'espace annonceur TPUB."
      version="Version provisoire · septembre 2026"
      sections={SECTIONS}
    />
  );
}
