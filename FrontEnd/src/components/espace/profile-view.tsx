"use client";

import { Building2, Clock, ImageUp, LogOut, Mail, Phone, Trash2 } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

import { PasswordChangeCard } from "@/components/account/password-change-card";
import { LoginHistoryCard, SessionsCard } from "@/components/account/sessions-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";

import { firstIssues } from "@/components/auth/auth-schemas";
import { Fact } from "@/components/espace/espace-ui";
import { useMarkOnboardingVisit } from "@/components/espace/onboarding-storage";
import {
  checkLogoFile,
  LOGO_ACCEPT,
  MAX_LOGO_BYTES,
  PROFILE_FIELDS,
  profileSchema,
  profileValuesOf,
  type ProfileValues,
  sameProfile,
  toMeUpdateRequest,
} from "@/components/espace/profile-model";
import { formatFileSize } from "@/components/campaign/media-model";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { CONTACT } from "@/content/site";
import { meApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";
import type { MeResponse } from "@/lib/api/types";
import { CLIENT_VALIDATION_STATUS, isClientBlocked, ROLE_LABEL } from "@/lib/campaign-status";
import { formatDateTime, initials } from "@/lib/format";
import { primeCache, resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";
import { useSignedMediaSrc } from "@/lib/use-signed-media";

export { PASSWORD_CHANGED_NOTICE } from "@/components/account/password-change-card";
export { LOGIN_HISTORY_LIMIT } from "@/components/account/sessions-card";

/**
 * /espace/profil — GET/PUT /me, logo, then the « Sécurité » section (#securite): password,
 * two-factor authentication, active sessions and login history.
 */
export function ProfileView() {
  const { user } = useSession();
  useMarkOnboardingVisit(user.userId, "visitedProfile");
  const me = useResource("espace:me", (signal) => meApi.get({ signal }), {
    cacheKey: resourceKeys.me,
  });
  const { setData } = me;
  const onMe = (next: MeResponse) => {
    setData(next);
    primeCache(resourceKeys.me, next);
  };

  return (
    <>
      <PageHeader
        title="Profil"
        description="Vos coordonnées, votre logo et la sécurité de votre compte : mot de passe, double authentification et appareils connectés."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {me.data ? (
            <>
              <AccountCard me={me.data} onMe={onMe} />
              <ProfileForm me={me.data} onMe={onMe} />
            </>
          ) : me.error ? (
            <ErrorState error={me.error} onRetry={me.reload} scope="section" />
          ) : (
            <LoadingRegion label="Chargement du profil…" className="flex flex-col gap-6">
              <Skeleton className="h-48 rounded-card" />
              <Skeleton className="h-80 rounded-card" />
            </LoadingRegion>
          )}
          <section
            id="securite"
            aria-label="Sécurité du compte"
            tabIndex={-1}
            className="flex scroll-mt-24 flex-col gap-6 focus:outline-none"
          >
            <PasswordChangeCard />
            <TwoFactorCard email={user.email} />
            <SessionsCard />
            <LoginHistoryCard />
          </section>
        </div>

        <aside
          aria-label="Votre interlocuteur ZELQANE"
          className="flex flex-col gap-6 lg:sticky lg:top-24"
        >
          <ContactCard />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Identity + logo
// ---------------------------------------------------------------------------
function AccountCard({ me, onMe }: { me: MeResponse; onMe: (me: MeResponse) => void }) {
  const { toast } = useToast();
  const { logout, loggingOut } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const client = me.client;
  // Round 2: the signed logo URL is refreshed once when it expired; then the initials are shown.
  const logo = useSignedMediaSrc(me.logoUrl);
  const validation = client ? CLIENT_VALIDATION_STATUS[client.validationStatus] : null;

  const upload = async (file: File) => {
    setLogoError(null);
    const problem = checkLogoFile(file);
    if (problem) {
      setLogoError(problem);
      return;
    }
    setProgress(0);
    try {
      const next = await meApi.uploadLogo(file, { onProgress: (f) => setProgress(f) });
      onMe(next);
      toast({ title: "Logo mis à jour", variant: "success" });
    } catch (e) {
      setLogoError(presentError(e).message);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card as="section" aria-labelledby="account-title" padding="none" className="overflow-hidden">
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px hairline-tricolor"
        />
        {logo.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file served by /uploads
          <img
            src={logo.src}
            onError={logo.onError}
            alt={`Logo de ${me.societe ?? me.nom}`}
            className="size-16 shrink-0 rounded-full border border-line bg-surface-2 object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-grad-brand font-display text-xl font-bold text-on-brand shadow-brand"
          >
            {initials(me.nom)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2
            id="account-title"
            className="font-display text-[1.375rem] leading-tight font-semibold break-words text-ink-strong"
          >
            {me.nom}
          </h2>
          <p className="mt-1 text-sm break-all text-muted">{me.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-center">
          <Badge tone="brand">{ROLE_LABEL[me.role]}</Badge>
          {validation ? <Badge tone={validation.tone}>{validation.label}</Badge> : null}
        </div>
      </div>

      {client && isClientBlocked(client.validationStatus) ? (
        <div className="px-6 pb-5 sm:px-8">
          <Alert tone="danger" live="none" title={`Compte ${validation?.label.toLowerCase()}`}>
            {validation?.description} Contactez l&apos;équipe ZELQANE ({CONTACT.email}) pour en
            connaître la raison.
          </Alert>
        </div>
      ) : client?.validationStatus === "PENDING" ? (
        <div className="px-6 pb-5 sm:px-8">
          <Alert tone="info" live="none">
            Votre compte est en cours de vérification par ZELQANE. Vous pouvez déjà préparer et
            soumettre des campagnes.
          </Alert>
        </div>
      ) : null}

      <dl className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-line p-6 sm:grid-cols-2 sm:p-8">
        <Fact label="E-mail de connexion">
          <span className="break-all">{me.email}</span>
        </Fact>
        <Fact label="Type de compte">{ROLE_LABEL[me.role]}</Fact>
        <Fact label="Dernière connexion">
          {me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "—"}
        </Fact>
        <Fact label="Compte créé le">{formatDateTime(me.createdAt)}</Fact>
      </dl>

      <div className="flex flex-col gap-3 border-t border-line p-6 sm:p-8">
        <p className="font-label text-[0.875rem] font-semibold text-ink-strong">Logo</p>
        <p className="text-[0.8125rem] text-muted">
          PNG, JPEG ou WebP, {formatFileSize(MAX_LOGO_BYTES)} maximum. Il identifie votre société
          auprès de l&apos;équipe ZELQANE.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            iconLeft={<ImageUp aria-hidden="true" />}
            loading={progress !== null}
            loadingLabel={
              progress !== null ? `Envoi du logo : ${Math.round(progress * 100)} %` : undefined
            }
            onClick={() => inputRef.current?.click()}
          >
            {me.logoUrl ? "Remplacer le logo" : "Ajouter un logo"}
          </Button>
          {me.logoUrl ? (
            <Button
              variant="ghost"
              iconLeft={<Trash2 aria-hidden="true" />}
              disabled={progress !== null}
              onClick={() => setRemoveOpen(true)}
            >
              Retirer le logo
            </Button>
          ) : null}
        </div>
        {progress !== null ? (
          <progress
            max={1}
            value={progress}
            aria-label="Progression de l'envoi du logo"
            className="h-1.5 w-full max-w-xs accent-brand-blue-text"
          />
        ) : null}
        {logoError ? (
          <Alert tone="danger" title="Logo non enregistré">
            {logoError}
          </Alert>
        ) : null}
      </div>

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

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Retirer le logo ?"
        description="Vos initiales seront affichées à la place."
        confirmLabel="Retirer le logo"
        onConfirm={async () => {
          onMe(await meApi.removeLogo());
          toast({ title: "Logo retiré", variant: "success" });
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coordinates (PUT /me)
// ---------------------------------------------------------------------------
type ProfileErrors = Partial<Record<(typeof PROFILE_FIELDS)[number], string>>;

function ProfileForm({ me, onMe }: { me: MeResponse; onMe: (me: MeResponse) => void }) {
  const { toast } = useToast();
  const baseId = useId();
  const initial = profileValuesOf(me);
  const [values, setValues] = useState<ProfileValues>(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = !sameProfile(values, initial);
  const fieldId = (f: string) => `${baseId}-${f}`;

  const set = (key: (typeof PROFILE_FIELDS)[number], value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      const errs = firstIssues<ProfileValues>(parsed.error, PROFILE_FIELDS);
      setErrors(errs);
      const first = PROFILE_FIELDS.find((f) => errs[f]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setPending(true);
    try {
      const next = await meApi.update(toMeUpdateRequest(parsed.data));
      onMe(next);
      setValues(profileValuesOf(next));
      setErrors({});
      toast({ title: "Profil enregistré", variant: "success" });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        const errs: ProfileErrors = {};
        for (const f of PROFILE_FIELDS) if (err.fieldErrors[f]) errs[f] = err.fieldErrors[f];
        setErrors(errs);
      }
      setFormError(presentError(err).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="company-title">
      <CardHeader
        title={<span id="company-title">Coordonnées</span>}
        description="Nom, société, téléphone et adresse transmis à ZELQANE pour examiner vos campagnes."
        icon={<Building2 />}
      />
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {formError ? (
          <Alert tone="danger" title="Profil non enregistré">
            {formError}
          </Alert>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field label="Nom affiché" id={fieldId("nom")} error={errors.nom} required>
            <Input
              name="nom"
              autoComplete="name"
              maxLength={150}
              value={values.nom}
              onChange={(e) => set("nom", e.target.value)}
            />
          </Field>
          <Field label="Société" id={fieldId("societe")} error={errors.societe}>
            <Input
              name="societe"
              autoComplete="organization"
              maxLength={200}
              value={values.societe}
              onChange={(e) => set("societe", e.target.value)}
            />
          </Field>
          <Field label="Téléphone" id={fieldId("telephone")} error={errors.telephone}>
            <Input
              name="telephone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              value={values.telephone}
              onChange={(e) => set("telephone", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Adresse" id={fieldId("adresse")} error={errors.adresse}>
          <Textarea
            name="adresse"
            autoComplete="street-address"
            rows={3}
            maxLength={1000}
            value={values.adresse}
            onChange={(e) => set("adresse", e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            loadingLabel="Enregistrement…"
            disabledReason={dirty ? null : "Aucune modification à enregistrer."}
          >
            Enregistrer
          </Button>
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setValues(initial);
                setErrors({});
                setFormError(null);
              }}
            >
              Annuler les modifications
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function ContactCard() {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-grad-card">
      <div className="p-6">
        <h2 className="font-display text-[1.25rem] leading-snug font-semibold text-ink-strong">
          Votre interlocuteur ZELQANE
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
  );
}
