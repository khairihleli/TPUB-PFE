"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  History,
  ImageUp,
  KeyRound,
  LogOut,
  Mail,
  MonitorSmartphone,
  Phone,
  Trash2,
  XCircle,
} from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

import { firstIssues } from "@/components/auth/auth-schemas";
import { Fact } from "@/components/espace/espace-ui";
import { useMarkOnboardingVisit } from "@/components/espace/onboarding-storage";
import {
  checkLogoFile,
  describeUserAgent,
  LOGO_ACCEPT,
  loginOutcomeLabel,
  MAX_LOGO_BYTES,
  PASSWORD_ERROR_FIELD,
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_FIELDS,
  passwordChangeSchema,
  type PasswordValues,
  PROFILE_FIELDS,
  profileSchema,
  profileValuesOf,
  type ProfileValues,
  sameProfile,
  sortSessions,
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
import { Field, Input, PasswordInput, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { CONTACT } from "@/content/site";
import { meApi } from "@/lib/api/endpoints";
import { ApiError, hasErrorCode, presentError } from "@/lib/api/errors";
import type { LoginHistoryResponse, MeResponse, UserSessionResponse } from "@/lib/api/types";
import { CLIENT_VALIDATION_STATUS, isClientBlocked, ROLE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateTime, formatRelative, initials } from "@/lib/format";
import { primeCache, resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

export const LOGIN_HISTORY_LIMIT = 20;
export const PASSWORD_CHANGED_NOTICE = "Vos autres sessions ont été déconnectées.";

/** /espace/profil — GET/PUT /me, logo, password, active sessions and login history. */
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
        description="Vos coordonnées, votre logo, votre mot de passe et les appareils connectés à votre compte."
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
          <PasswordCard />
          <SessionsCard />
          <LoginHistoryCard />
        </div>

        <aside
          aria-label="Votre interlocuteur TPUB"
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
        {me.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded file served by /uploads
          <img
            src={me.logoUrl}
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
            {validation?.description} Contactez l&apos;équipe TPUB ({CONTACT.email}) pour en
            connaître la raison.
          </Alert>
        </div>
      ) : client?.validationStatus === "PENDING" ? (
        <div className="px-6 pb-5 sm:px-8">
          <Alert tone="info" live="none">
            Votre compte est en cours de vérification par TPUB. Vous pouvez déjà préparer et
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
          auprès de l&apos;équipe TPUB.
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
        description="Nom, société, téléphone et adresse transmis à TPUB pour examiner vos campagnes."
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

// ---------------------------------------------------------------------------
// Password (POST /me/password)
// ---------------------------------------------------------------------------
type PasswordErrors = Partial<Record<(typeof PASSWORD_FIELDS)[number], string>>;
const EMPTY_PASSWORDS: PasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function PasswordCard() {
  const baseId = useId();
  const [values, setValues] = useState<PasswordValues>(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const fieldId = (f: string) => `${baseId}-${f}`;

  const set = (key: (typeof PASSWORD_FIELDS)[number], value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDone(false);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const focusFirst = (errs: PasswordErrors) => {
    const first = PASSWORD_FIELDS.find((f) => errs[f]);
    if (first) document.getElementById(fieldId(first))?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    setDone(false);
    const parsed = passwordChangeSchema.safeParse(values);
    if (!parsed.success) {
      const errs = firstIssues<PasswordValues>(parsed.error, PASSWORD_FIELDS);
      setErrors(errs);
      focusFirst(errs);
      return;
    }
    setPending(true);
    try {
      await meApi.changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      setValues(EMPTY_PASSWORDS);
      setErrors({});
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      const field = code ? PASSWORD_ERROR_FIELD[code] : undefined;
      if (field && code) {
        const errs = { [field]: PASSWORD_ERROR_MESSAGE[code] } as PasswordErrors;
        setErrors(errs);
        focusFirst(errs);
      } else if (err instanceof ApiError && err.fieldErrors.newPassword) {
        const errs = { newPassword: err.fieldErrors.newPassword };
        setErrors(errs);
        focusFirst(errs);
      } else {
        setFormError(presentError(err).message);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="password-title">
      <CardHeader
        title={<span id="password-title">Mot de passe</span>}
        description="Au moins 8 caractères, dont une lettre et un chiffre."
        icon={<KeyRound />}
      />
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {done ? (
          <Alert tone="success" title="Mot de passe modifié">
            {PASSWORD_CHANGED_NOTICE}
          </Alert>
        ) : null}
        {formError ? (
          <Alert tone="danger" title="Mot de passe non modifié">
            {formError}
          </Alert>
        ) : null}
        <Field
          label="Mot de passe actuel"
          id={fieldId("currentPassword")}
          error={errors.currentPassword}
          required
        >
          <PasswordInput
            name="currentPassword"
            autoComplete="current-password"
            maxLength={100}
            value={values.currentPassword}
            onChange={(e) => set("currentPassword", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field
            label="Nouveau mot de passe"
            id={fieldId("newPassword")}
            error={errors.newPassword}
            required
          >
            <PasswordInput
              name="newPassword"
              autoComplete="new-password"
              maxLength={100}
              value={values.newPassword}
              onChange={(e) => set("newPassword", e.target.value)}
            />
          </Field>
          <Field
            label="Confirmation"
            id={fieldId("confirmPassword")}
            error={errors.confirmPassword}
            required
          >
            <PasswordInput
              name="confirmPassword"
              autoComplete="new-password"
              maxLength={100}
              value={values.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
            />
          </Field>
        </div>
        <p className="text-[0.8125rem] text-muted">
          Les autres appareils connectés seront déconnectés ; celui-ci reste connecté.
        </p>
        <div>
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Modification…">
            Modifier le mot de passe
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active sessions
// ---------------------------------------------------------------------------
function SessionsCard() {
  const { toast } = useToast();
  const sessions = useResource("espace:me:sessions", (signal) => meApi.sessions({ signal }));
  const { setData } = sessions;
  const [revoking, setRevoking] = useState<UserSessionResponse | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const list = sortSessions(sessions.data ?? []);
  const others = list.filter((s) => !s.current);

  return (
    <Card as="section" aria-labelledby="sessions-title">
      <CardHeader
        title={<span id="sessions-title">Sessions actives</span>}
        description="Les appareils actuellement connectés à votre compte."
        icon={<MonitorSmartphone />}
        actions={
          others.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setOthersOpen(true)}>
              Déconnecter les autres appareils
            </Button>
          ) : undefined
        }
      />
      {sessions.error && !sessions.data ? (
        <ErrorState error={sessions.error} onRetry={sessions.reload} scope="section" />
      ) : !sessions.data ? (
        <LoadingRegion label="Chargement des sessions…">
          <Skeleton className="h-24 rounded-card" />
        </LoadingRegion>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">Aucune session active.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {list.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                  {describeUserAgent(s.userAgent)}
                  {s.current ? (
                    <Badge tone="success" size="sm">
                      Cet appareil
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-muted">
                  {s.ipAddress ? `IP ${s.ipAddress} · ` : ""}Dernière activité{" "}
                  <time dateTime={s.lastSeenAt} title={formatDateTime(s.lastSeenAt)}>
                    {formatRelative(s.lastSeenAt)}
                  </time>{" "}
                  · Connecté le {formatDateTime(s.createdAt)}
                </p>
              </div>
              {s.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<LogOut aria-hidden="true" />}
                  onClick={() => setRevoking(s)}
                >
                  Déconnecter
                  <span className="sr-only"> : {describeUserAgent(s.userAgent)}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Déconnecter cet appareil ?"
        description={
          revoking
            ? `${describeUserAgent(revoking.userAgent)}${revoking.ipAddress ? ` (IP ${revoking.ipAddress})` : ""} devra se reconnecter.`
            : undefined
        }
        confirmLabel="Déconnecter"
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await meApi.revokeSession(revoking.id);
          } catch (e) {
            // Already gone (expired or revoked elsewhere): the list is simply out of date.
            if (!hasErrorCode(e, "SESSION_NOT_FOUND")) throw e;
          }
          const id = revoking.id;
          setData((prev) => (prev ?? []).filter((s) => s.id !== id));
          toast({ title: "Appareil déconnecté", variant: "success" });
        }}
      />
      <ConfirmDialog
        open={othersOpen}
        onOpenChange={setOthersOpen}
        title="Déconnecter les autres appareils ?"
        description="Tous les appareils sauf celui-ci devront se reconnecter."
        confirmLabel="Déconnecter les autres"
        onConfirm={async () => {
          const { revoked } = await meApi.revokeOtherSessions();
          setData((prev) => (prev ?? []).filter((s) => s.current));
          toast({
            title:
              revoked > 1
                ? `${revoked} appareils déconnectés`
                : revoked === 1
                  ? "1 appareil déconnecté"
                  : "Aucun autre appareil connecté",
            variant: "success",
          });
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Login history
// ---------------------------------------------------------------------------
function LoginHistoryCard() {
  const history = useResource("espace:me:login-history", (signal) =>
    meApi.loginHistory(LOGIN_HISTORY_LIMIT, { signal }),
  );
  const rows: LoginHistoryResponse[] = history.data ?? [];

  return (
    <Card as="section" aria-labelledby="history-title">
      <CardHeader
        title={<span id="history-title">Historique des connexions</span>}
        description={`Les ${LOGIN_HISTORY_LIMIT} dernières tentatives de connexion à votre compte.`}
        icon={<History />}
      />
      {history.error && !history.data ? (
        <ErrorState error={history.error} onRetry={history.reload} scope="section" />
      ) : !history.data ? (
        <LoadingRegion label="Chargement de l'historique…">
          <Skeleton className="h-32 rounded-card" />
        </LoadingRegion>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Aucune connexion enregistrée.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">Historique des connexions</caption>
            <thead>
              <tr className="border-b border-line text-left font-label text-[0.75rem] text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Résultat
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Appareil
                </th>
                <th scope="col" className="py-2 pl-3 font-semibold">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular">
                    {formatDateTime(h.createdAt)}
                  </td>
                  <td className={cx("px-3 py-2.5", h.success ? "text-success" : "text-danger")}>
                    <span className="inline-flex items-center gap-1.5">
                      {h.success ? (
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                      ) : (
                        <XCircle aria-hidden="true" className="size-4" />
                      )}
                      {loginOutcomeLabel(h)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{describeUserAgent(h.userAgent)}</td>
                  <td className="py-2.5 pl-3 text-muted tabular">{h.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[0.8125rem] text-muted">
        Une tentative que vous ne reconnaissez pas ? Changez votre mot de passe puis déconnectez les
        autres appareils.
      </p>
    </Card>
  );
}

function ContactCard() {
  return (
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
  );
}
