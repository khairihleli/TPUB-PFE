import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalTable, type LegalSection } from "@/components/contact/legal-document";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Quelles informations TPUB traite via le formulaire de contact et l'espace annonceur, pourquoi, et comment exercer vos demandes. Document en cours de validation juridique.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "responsable",
    title: "Qui traite vos informations",
    content: (
      <p>
        Les informations transmises sur ce site sont traitées par <strong>TPUB</strong>, une société
        du groupe Tukhnanutha, basée à {CONTACT.city}. Pour toute question sur ce document :{" "}
        {CONTACT.email}.
      </p>
    ),
  },
  {
    id: "donnees",
    title: "Informations traitées",
    content: (
      <>
        <LegalTable
          caption="Informations traitées selon le service utilisé"
          head={["Service", "Informations", "Origine"]}
          rows={[
            [
              "Formulaire de contact",
              "Nom et prénom, e-mail professionnel, téléphone, société ou agence, profil, besoin, zones visées, période envisagée, message.",
              "Saisies par vous",
            ],
            [
              "Compte annonceur",
              "Prénom et nom, société, e-mail professionnel, téléphone, adresse, mot de passe.",
              "Saisies par vous à l'inscription",
            ],
            [
              "Espace annonceur",
              "Campagnes (nom, objectif, budget, période, plages horaires), réservations de créneaux, résultats d'analyse des contenus et décisions de validation.",
              "Créées lors de l'utilisation de la plateforme",
            ],
            [
              "Fonctionnement technique",
              "Données de session (voir la page Cookies) et journaux techniques nécessaires au bon fonctionnement et à la sécurité du service.",
              "Générées automatiquement",
            ],
          ]}
        />
        <p>
          Seules les informations marquées d&apos;un astérisque dans les formulaires sont
          obligatoires. Les autres nous aident à mieux comprendre votre besoin.
        </p>
      </>
    ),
  },
  {
    id: "finalites",
    title: "Pourquoi nous les utilisons",
    content: (
      <ul>
        <li>Répondre à votre demande de contact et vous faire une proposition adaptée.</li>
        <li>Créer et gérer votre compte annonceur, et examiner votre dossier.</li>
        <li>
          Préparer, contrôler et suivre vos campagnes : réservations, analyse des contenus,
          validation, diffusion et statistiques.
        </li>
        <li>Assurer la sécurité de la plateforme et prévenir les usages abusifs.</li>
      </ul>
    ),
  },
  {
    id: "moderation",
    title: "Contrôle des contenus",
    content: (
      <>
        <p>
          Chaque campagne soumise est analysée par un outil d&apos;intelligence artificielle (niveau
          de risque et qualité notés sur 100, points relevés, recommandation). Cette analyse assiste
          la décision : la plateforme est conçue pour qu&apos;aucune campagne ne soit diffusée sans
          la validation d&apos;un expert TPUB.
        </p>
        <p>Les résultats d&apos;analyse et les décisions de modération sont enregistrés.</p>
      </>
    ),
  },
  {
    id: "audience",
    title: "Écrans et passants",
    content: (
      <p>
        La plateforme journalise les diffusions (écran, zone, campagne, horaire, durée) : ce journal
        décrit l&apos;activité des écrans, pas les personnes. TPUB n&apos;a pas vocation à
        identifier les passants. Lorsque des indicateurs d&apos;audience existent, ils sont
        anonymes, agrégés et présentés avec leur méthode.
      </p>
    ),
  },
  {
    id: "destinataires",
    title: "Qui y a accès",
    content: (
      <p>
        Vos informations sont accessibles à l&apos;équipe TPUB, dans la limite de ce qui est
        nécessaire à ses missions, ainsi qu&apos;aux prestataires techniques qui assurent
        l&apos;hébergement et le fonctionnement du service. Elles ne sont pas vendues. La liste des
        prestataires sera précisée à l&apos;issue de la validation juridique.
      </p>
    ),
  },
  {
    id: "conservation",
    title: "Durée de conservation",
    content: (
      <p>
        Les informations sont conservées le temps nécessaire au traitement de votre demande ou à la
        gestion de votre compte. Les durées précises de conservation seront indiquées à l&apos;issue
        de la validation juridique de ce document.
      </p>
    ),
  },
  {
    id: "securite",
    title: "Sécurité",
    content: (
      <ul>
        <li>
          Votre session est conservée dans des cookies inaccessibles aux scripts de la page et
          expire au plus tard après 24 heures.
        </li>
        <li>
          Les échanges avec la plateforme passent par le serveur du site, sans exposer vos jetons de
          connexion au navigateur.
        </li>
        <li>Le mot de passe de votre compte vous est personnel : ne le communiquez à personne.</li>
      </ul>
    ),
  },
  {
    id: "demandes",
    title: "Vos demandes",
    content: (
      <>
        <p>
          Vous pouvez demander à accéder aux informations qui vous concernent, à les faire corriger
          ou supprimer. Écrivez à {CONTACT.email} depuis l&apos;adresse associée à votre demande ou
          à votre compte, ou utilisez le <Link href="/contact">formulaire de contact</Link>.
        </p>
        <p>
          Pour protéger vos informations, nous pouvons vous demander de confirmer votre identité
          avant de traiter la demande.
        </p>
      </>
    ),
  },
];

export default function ConfidentialitePage() {
  return (
    <LegalDocument
      href="/confidentialite"
      label="Confidentialité"
      title="Politique de confidentialité"
      lede="Ce que nous faisons des informations que vous nous confiez, et comment nous en demander l'accès, la correction ou la suppression."
      version="Version provisoire · septembre 2026"
      sections={SECTIONS}
    />
  );
}
