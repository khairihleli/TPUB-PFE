import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalTable, type LegalSection } from "@/components/contact/legal-document";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "Les cookies et stockages utilisés par le site ZELQANE : uniquement ce qui est nécessaire à la connexion et au confort de navigation. Document en cours de validation juridique.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "definition",
    title: "Qu'est-ce qu'un cookie ?",
    content: (
      <p>
        Un cookie est un petit fichier déposé par un site dans votre navigateur. Il permet par
        exemple de vous garder connecté d&apos;une page à l&apos;autre. Le navigateur propose aussi
        d&apos;autres espaces de stockage locaux, qui fonctionnent de façon comparable.
      </p>
    ),
  },
  {
    id: "inventaire",
    title: "Ce que le site utilise",
    content: (
      <>
        <p>
          À ce jour, le site n&apos;utilise que des éléments nécessaires à son fonctionnement. Il ne
          dépose aucun cookie publicitaire ni de mesure d&apos;audience.
        </p>
        <LegalTable
          caption="Cookies et stockages utilisés par le site ZELQANE"
          head={["Nom", "Type", "Rôle", "Durée"]}
          rows={[
            [
              <code key="c">zelqane_token</code>,
              "Cookie strictement nécessaire, inaccessible aux scripts",
              "Maintient votre connexion à l'espace annonceur ou au back-office.",
              "Jusqu'à l'expiration de la session (24 heures au plus) ou la déconnexion",
            ],
            [
              <code key="c">zelqane_user</code>,
              "Cookie strictement nécessaire, inaccessible aux scripts",
              "Mémorise les informations de session (nom, e-mail, rôle) pour afficher votre espace.",
              "Identique à zelqane_token",
            ],
            [
              <code key="c">zelqane:status-banner-dismissed</code>,
              "Stockage de session du navigateur",
              "Retient que vous avez fermé le bandeau de statut du site.",
              "Jusqu'à la fermeture de l'onglet",
            ],
            [
              <code key="c">zelqane:onboarding:…</code>,
              "Stockage local du navigateur",
              "Retient, dans l'espace annonceur, les étapes de prise en main déjà consultées ou masquées.",
              "Jusqu'à ce que vous effaciez les données du site dans votre navigateur",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "consentement",
    title: "Consentement",
    content: (
      <p>
        Les éléments listés ci-dessus sont indispensables à la connexion ou purement liés à votre
        confort de navigation : ils ne servent ni à vous suivre, ni à vous proposer de la publicité.
        Si des cookies d&apos;une autre nature devaient être ajoutés, cette page serait mise à jour
        et votre accord serait demandé au préalable.
      </p>
    ),
  },
  {
    id: "tiers",
    title: "Services tiers",
    content: (
      <p>
        Le site ne contient aucun contenu intégré de réseau social ni de vidéo. Les liens vers
        LinkedIn ou YouTube sont de simples liens : ces services peuvent déposer leurs propres
        cookies une fois que vous les avez ouverts, selon leurs politiques.
      </p>
    ),
  },
  {
    id: "gerer",
    title: "Gérer les cookies",
    content: (
      <>
        <p>
          Vous pouvez supprimer ou bloquer les cookies depuis les réglages de votre navigateur. Le
          blocage des cookies de session empêche toutefois la connexion à l&apos;espace annonceur.
        </p>
        <p>La déconnexion depuis votre espace supprime immédiatement les cookies de session.</p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Pour toute question : {CONTACT.email} ou le{" "}
        <Link href="/contact">formulaire de contact</Link>. Le traitement de vos informations est
        décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalDocument
      href="/cookies"
      label="Cookies"
      title="Cookies"
      lede="Les cookies et stockages utilisés par le site, et pourquoi ils sont limités au strict nécessaire."
      version="Version provisoire · septembre 2026"
      sections={SECTIONS}
    />
  );
}
