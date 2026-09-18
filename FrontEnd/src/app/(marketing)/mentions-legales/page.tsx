import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalFacts, type LegalSection } from "@/components/contact/legal-document";
import { CONTACT, GROUP, SOCIAL, STATUS_NOTICE } from "@/content/site";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Éditeur du site ZELQANE, société du groupe Tukhnanutha, coordonnées, hébergement et propriété intellectuelle. Document en cours de validation juridique.",
};

const PENDING = "Précisé à l'issue de la validation juridique";

const SECTIONS: readonly LegalSection[] = [
  {
    id: "editeur",
    title: "Éditeur du site",
    content: (
      <>
        <p>
          Le présent site et la plateforme associée sont édités par <strong>ZELQANE</strong>, une
          société du groupe Tukhnanutha, spécialisée dans l&apos;affichage numérique extérieur.
        </p>
        <LegalFacts
          items={[
            { term: "Dénomination", value: "ZELQANE" },
            { term: "Groupe", value: GROUP.mention },
            { term: "Siège", value: CONTACT.address },
            {
              term: "E-mail",
              value: CONTACT.email,
            },
            {
              term: "Téléphone",
              value: <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>,
            },
            { term: "Forme juridique et immatriculation", value: PENDING },
            { term: "Directeur de la publication", value: PENDING },
          ]}
        />
        <p>
          ZELQANE contracte avec ses clients sous sa propre identité. Les informations
          d&apos;immatriculation ne sont pas publiées tant qu&apos;elles n&apos;ont pas été
          vérifiées dans le cadre de la validation juridique de ce document.
        </p>
      </>
    ),
  },
  {
    id: "groupe",
    title: "Groupe Tukhnanutha",
    content: (
      <>
        <p>
          {GROUP.pole} Le Porteur, cellule de déploiement du groupe, est présenté sur le site du
          groupe.
        </p>
        <ul>
          <li>
            Site du groupe :{" "}
            <a href={GROUP.url} target="_blank" rel="noopener noreferrer">
              tukhnanutha.com
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </li>
          <li>
            Page ZELQANE sur le site du groupe :{" "}
            <a href={GROUP.zelqanePage} target="_blank" rel="noopener noreferrer">
              tukhnanutha.com/company/zelqane
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "hebergement",
    title: "Hébergement",
    content: (
      <p>
        L&apos;hébergeur du site et de la plateforme sera précisé lors de leur mise en ligne
        publique, avec sa dénomination, son adresse et ses coordonnées.
      </p>
    ),
  },
  {
    id: "statut",
    title: "Statut du site et exactitude des contenus",
    content: (
      <>
        <p>{STATUS_NOTICE}</p>
        <p>
          Les caractéristiques présentées, notamment celles du Porteur et des types
          d&apos;emplacements, expriment une intention de conception et non des performances
          constatées. Le site ne publie ni nombre d&apos;écrans, ni chiffres d&apos;audience, ni
          tarifs. Les coûts et vues affichés dans l&apos;espace annonceur sont des estimations
          indicatives.
        </p>
        <p>
          Les photographies utilisées sont des illustrations : elles ne représentent pas des
          emplacements en service.
        </p>
      </>
    ),
  },
  {
    id: "propriete-intellectuelle",
    title: "Propriété intellectuelle",
    content: (
      <p>
        Le nom et le logo ZELQANE, les textes, visuels et éléments graphiques de ce site sont protégés.
        Toute reproduction ou représentation, totale ou partielle, au-delà d&apos;une courte
        citation mentionnant la source, nécessite une autorisation écrite préalable de ZELQANE. Les
        marques et contenus du groupe Tukhnanutha restent la propriété de leurs titulaires.
      </p>
    ),
  },
  {
    id: "liens",
    title: "Liens externes",
    content: (
      <>
        <p>
          Le site renvoie vers des services tiers, qui appliquent leurs propres conditions et
          politiques de confidentialité :
        </p>
        <ul>
          <li>
            <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn<span className="sr-only"> (nouvel onglet)</span>
            </a>
          </li>
          <li>
            <a href={SOCIAL.youtube} target="_blank" rel="noopener noreferrer">
              YouTube<span className="sr-only"> (nouvel onglet)</span>
            </a>
          </li>
        </ul>
        <p>Ces liens sont de simples liens : aucun contenu de ces services n&apos;est intégré.</p>
      </>
    ),
  },
  {
    id: "donnees",
    title: "Données personnelles et cookies",
    content: (
      <p>
        Le traitement des informations transmises via le formulaire de contact et l&apos;espace
        annonceur est décrit dans la{" "}
        <Link href="/confidentialite">politique de confidentialité</Link>. Les cookies utilisés sont
        listés sur la page <Link href="/cookies">Cookies</Link>.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Pour toute question relative au site : {CONTACT.email}, {CONTACT.phone}, ou via le{" "}
        <Link href="/contact">formulaire de contact</Link>.
      </p>
    ),
  },
];

export default function MentionsLegalesPage() {
  return (
    <LegalDocument
      href="/mentions-legales"
      label="Mentions légales"
      title="Mentions légales"
      lede="Qui édite ce site, comment nous joindre, et ce qu'il faut savoir sur les contenus présentés."
      version="Version provisoire · septembre 2026"
      sections={SECTIONS}
    />
  );
}
