"use client";

import {
  Building2,
  Clock,
  CreditCard,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { Fact } from "@/components/espace/espace-ui";
import { useMarkOnboardingVisit } from "@/components/espace/onboarding-storage";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CONTACT } from "@/content/site";
import { ROLE_LABEL } from "@/lib/campaign-status";
import { formatDateTime, initials } from "@/lib/format";

export function ProfileView() {
  const { user, logout, loggingOut } = useSession();
  useMarkOnboardingVisit(user.userId, "visitedProfile");
  const expiresAt = Number.isFinite(user.exp) && user.exp > 0 ? new Date(user.exp * 1000) : null;

  return (
    <>
      <PageHeader
        title="Profil"
        description="Les informations de votre compte annonceur et de votre session."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card
            as="section"
            aria-labelledby="account-title"
            padding="none"
            className="overflow-hidden"
          >
            <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px hairline-tricolor"
              />
              <span
                aria-hidden="true"
                className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-grad-brand font-display text-xl font-bold text-on-brand shadow-brand"
              >
                {initials(user.nom)}
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="account-title"
                  className="font-display text-[1.375rem] leading-tight font-semibold break-words text-ink-strong"
                >
                  {user.nom}
                </h2>
                <p className="mt-1 text-sm break-all text-muted">{user.email}</p>
              </div>
              <Badge tone="brand" className="self-start sm:self-center">
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-line p-6 sm:grid-cols-2 sm:p-8">
              <Fact label="Nom affiché">{user.nom}</Fact>
              <Fact label="E-mail de connexion">
                <span className="break-all">{user.email}</span>
              </Fact>
              <Fact label="Type de compte">{ROLE_LABEL[user.role]}</Fact>
              <Fact label="Session valable jusqu'au">
                {expiresAt ? formatDateTime(expiresAt) : "—"}
              </Fact>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-overlay-inset px-6 py-4 sm:px-8">
              <p className="text-[0.8125rem] text-muted">
                Sur un ordinateur partagé, pensez à vous déconnecter.
              </p>
              <Button
                variant="secondary"
                onClick={() => void logout()}
                loading={loggingOut}
                loadingLabel="Déconnexion…"
                iconLeft={<LogOut aria-hidden="true" />}
              >
                Se déconnecter
              </Button>
            </div>
          </Card>

          <Card as="section" id="societe" aria-labelledby="company-title" className="scroll-mt-24">
            <CardHeader
              title={<span id="company-title">Société</span>}
              description="Raison sociale, téléphone et adresse"
              icon={<Building2 />}
            />
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-soft">
              <p>
                Ce sont les informations transmises à TPUB pour examiner vos campagnes. Une
                correction ? Contactez votre interlocuteur.
              </p>
              <p className="text-muted">Elles ne sont pas modifiables en ligne pour le moment.</p>
            </div>
            <div className="mt-5">
              <Button asChild variant="secondary">
                <a
                  href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Mise à jour de mon profil annonceur")}`}
                >
                  <Mail aria-hidden="true" />
                  Demander une correction
                </a>
              </Button>
            </div>
          </Card>

          <Card as="section" aria-labelledby="security-title">
            <CardHeader
              title={<span id="security-title">Sécurité</span>}
              description="Session et mot de passe"
              icon={<ShieldCheck />}
            />
            <ul className="flex flex-col gap-4 text-sm leading-relaxed">
              <li className="flex gap-3">
                <Clock
                  aria-hidden="true"
                  className="mt-0.5 size-4.5 shrink-0 text-brand-blue-text"
                />
                <span className="text-ink-soft">
                  Votre session reste ouverte 24 heures après la connexion. Au-delà, vous serez
                  invité à vous reconnecter : votre travail enregistré est conservé.
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-4.5 shrink-0 text-brand-blue-text"
                />
                <span className="text-ink-soft">
                  Votre jeton de connexion est conservé dans un cookie sécurisé, inaccessible aux
                  scripts de la page.
                </span>
              </li>
              <li className="flex gap-3">
                <KeyRound
                  aria-hidden="true"
                  className="mt-0.5 size-4.5 shrink-0 text-brand-blue-text"
                />
                <span className="text-ink-soft">
                  Changement de mot de passe : bientôt disponible. En attendant, contactez TPUB si
                  vous pensez que votre compte est compromis.
                </span>
              </li>
            </ul>
          </Card>
        </div>

        <aside
          aria-label="Votre interlocuteur TPUB"
          className="flex flex-col gap-6 lg:sticky lg:top-24"
        >
          <div className="overflow-hidden rounded-panel border border-line bg-grad-card">
            <div className="p-6">
              <h2 className="font-display text-[1.25rem] leading-snug font-semibold text-ink-strong">
                Votre interlocuteur TPUB
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                De la réservation à la diffusion, une même équipe répond à vos questions.
              </p>
              <ul className="mt-5 flex flex-col gap-1">
                <li>
                  <a
                    href={`mailto:${CONTACT.email}`}
                    className="flex min-h-touch items-center gap-3 rounded-control text-sm text-brand-blue-text hover:underline"
                  >
                    <Mail aria-hidden="true" className="size-4 shrink-0" />
                    <span className="break-all">{CONTACT.email}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={CONTACT.phoneHref}
                    className="flex min-h-touch items-center gap-3 rounded-control text-sm text-brand-blue-text hover:underline"
                  >
                    <Phone aria-hidden="true" className="size-4 shrink-0" />
                    <span className="tabular">{CONTACT.phone}</span>
                  </a>
                </li>
                <li className="flex min-h-touch items-center gap-3 text-sm text-muted">
                  <Clock aria-hidden="true" className="size-4 shrink-0" />
                  {CONTACT.hours}
                </li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 rounded-card border border-dashed border-line-strong p-5">
            <CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
            <p className="text-sm leading-relaxed text-muted">
              <span className="font-semibold text-ink-soft">
                Paiement en ligne : bientôt disponible.
              </span>{" "}
              Les montants affichés dans votre espace sont indicatifs.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
