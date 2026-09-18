"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  ENROLMENT_PATH,
  safeRedirectPath,
  sessionDestination,
  VERIFICATION_PATH,
} from "@/components/auth/auth-redirect";
import { clearChallengeInfo, storeChallengeInfo } from "@/components/auth/challenge-storage";
import {
  firstIssues,
  loginSchema,
  type FieldErrorsOf,
  type LoginValues,
} from "@/components/auth/auth-schemas";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { ApiError, presentError, sessionApi, SESSION_EXPIRED_MESSAGE } from "@/lib/api";
import { normalizeSessionLogin } from "@/lib/api/endpoints";
import { hasErrorCode } from "@/lib/api/errors";

const FIELDS = ["email", "password"] as const;
type Errors = FieldErrorsOf<LoginValues>;

export interface LoginFormProps {
  next: string | null;
  expired: boolean;
  /** Round 2: the second login step expired (back from /connexion/verification). */
  verificationExpired?: boolean;
}

export const VERIFICATION_EXPIRED_MESSAGE =
  "La vérification en deux étapes a expiré. Saisissez à nouveau votre mot de passe.";

export const ACCOUNT_DISABLED_MESSAGE =
  "Ce compte est désactivé. Contactez l'équipe ZELQANE pour le réactiver.";
export const BAD_CREDENTIALS_MESSAGE = "E-mail ou mot de passe incorrect.";

/** Stable backend codes first (contract §2.0 / §2.10), then the legacy status fallbacks. */
export function loginErrorMessage(e: unknown): string {
  if (hasErrorCode(e, "ACCOUNT_DISABLED")) return ACCOUNT_DISABLED_MESSAGE;
  if (hasErrorCode(e, "BAD_CREDENTIALS")) return BAD_CREDENTIALS_MESSAGE;
  if (e instanceof ApiError) {
    if (e.status === 401) return BAD_CREDENTIALS_MESSAGE;
    // Spring answers 500 for a deactivated account (contract §4).
    if (e.status === 500) {
      return "La connexion n'a pas abouti. Si le problème persiste, contactez l'équipe ZELQANE.";
    }
  }
  return presentError(e).message;
}

export function LoginForm({ next, expired, verificationExpired = false }: LoginFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<LoginValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  function set(key: (typeof FIELDS)[number], value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusField(errs: Errors) {
    const first = FIELDS.find((f) => errs[f]);
    if (first) document.getElementById(`login-${first}`)?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const errs = firstIssues<LoginValues>(parsed.error, FIELDS);
      setErrors(errs);
      requestAnimationFrame(() => focusField(errs));
      return;
    }

    busy.current = true;
    setPending(true);
    try {
      const result = normalizeSessionLogin(await sessionApi.login(parsed.data));
      if (result.status !== "AUTHENTICATED") {
        // Round 2 §3.7: second step (TOTP code) or mandatory 2FA enrolment.
        storeChallengeInfo({
          status: result.status,
          email: result.email,
          expiresAt: result.expiresAt,
        });
        const target = result.status === "TOTP_REQUIRED" ? VERIFICATION_PATH : ENROLMENT_PATH;
        const safe = safeRedirectPath(next);
        router.replace(safe ? `${target}?next=${encodeURIComponent(safe)}` : target);
        return;
      }
      clearChallengeInfo();
      router.replace(sessionDestination(next, result.user));
      router.refresh();
      // Keep the pending state while navigating.
    } catch (err) {
      busy.current = false;
      setPending(false);
      if (err instanceof ApiError && err.status === 400 && Object.keys(err.fieldErrors).length) {
        const errs: Errors = {};
        for (const f of FIELDS) if (err.fieldErrors[f]) errs[f] = err.fieldErrors[f];
        if (Object.keys(errs).length) {
          setErrors(errs);
          requestAnimationFrame(() => focusField(errs));
          return;
        }
      }
      setFormError(loginErrorMessage(err));
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-label="Connexion"
      className="flex flex-col gap-5"
    >
      {verificationExpired && !formError ? (
        <Alert tone="warning" title="Vérification expirée">
          {VERIFICATION_EXPIRED_MESSAGE}
        </Alert>
      ) : expired && !formError ? (
        <Alert tone="warning" title="Session expirée">
          {SESSION_EXPIRED_MESSAGE}
        </Alert>
      ) : null}

      {formError ? (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <Alert tone="danger" live="alert">
            {formError}
          </Alert>
        </div>
      ) : null}

      <Field label="E-mail" error={errors.email} id="login-email" required>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          maxLength={255}
        />
      </Field>

      <Field label="Mot de passe" error={errors.password} id="login-password" required>
        <PasswordInput
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          maxLength={100}
        />
      </Field>

      <div className="-mt-2 flex justify-end">
        <Link
          href="/mot-de-passe-oublie"
          className="inline-flex min-h-touch items-center rounded-sm text-[0.8125rem] font-medium text-brand-blue-text underline-offset-4 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Connexion en cours…"
        iconRight={<LogIn />}
        className="mt-1"
      >
        Se connecter
      </Button>
    </form>
  );
}
