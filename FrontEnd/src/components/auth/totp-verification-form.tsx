"use client";

import { ArrowRight, KeyRound, LifeBuoy, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { CodeInput } from "@/components/account/code-input";
import {
  type CodeMode,
  codeError,
  codeForSubmit,
  formatRemaining,
  secondsUntilIso,
} from "@/components/account/two-factor-model";
import { sessionDestination } from "@/components/auth/auth-redirect";
import {
  type ChallengeInfo,
  clearChallengeInfo,
  readChallengeInfo,
} from "@/components/auth/challenge-storage";
import { useNow } from "@/components/player/use-now";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { sessionApi } from "@/lib/api/endpoints";
import { hasErrorCode, isChallengeExpiredError, presentError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/api/types";

export const EXPIRED_LOGIN_PATH = "/connexion?verification=expiree";

/** Where to go when the challenge is over (keeps a valid ?next=). */
export function expiredLoginHref(next: string | null): string {
  return next ? `${EXPIRED_LOGIN_PATH}&next=${encodeURIComponent(next)}` : EXPIRED_LOGIN_PATH;
}

/**
 * /connexion/verification — second login step (docs/round2-contract.md §3.7): the 6-digit code
 * of the authenticator app, or a recovery code. A recovery code opens the session but reminds the
 * user to generate new codes before continuing.
 */
export function TotpVerificationForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [mode, setMode] = useState<CodeMode>("totp");
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recoveryUser, setRecoveryUser] = useState<SessionUser | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // The code field is the only task of this page: focus it once (instead of autoFocus, jsx-a11y).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const busy = useRef(false);
  const now = useNow(recoveryUser === null);

  useEffect(() => {
    setInfo(readChallengeInfo("TOTP_REQUIRED"));
  }, []);

  const remaining = info && now !== null ? secondsUntilIso(info.expiresAt, now) : null;
  const expired = remaining === 0;

  const switchMode = () => {
    setMode((m) => (m === "totp" ? "recovery" : "totp"));
    setCode("");
    setFieldError(null);
    setFormError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);
    const problem = codeError(code, mode);
    if (problem) {
      setFieldError(problem);
      inputRef.current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const result = await sessionApi.verifyTotp(codeForSubmit(code, mode));
      clearChallengeInfo();
      if (result.recoveryCodeUsed) {
        setRecoveryUser(result.user);
        busy.current = false;
        setPending(false);
        return;
      }
      router.replace(sessionDestination(next, result.user));
      router.refresh();
    } catch (err) {
      busy.current = false;
      setPending(false);
      if (isChallengeExpiredError(err)) {
        clearChallengeInfo();
        router.replace(expiredLoginHref(next));
        return;
      }
      if (hasErrorCode(err, "TOTP_CODE_INVALID")) {
        setFieldError(
          mode === "totp"
            ? "Code incorrect. Vérifiez l'heure de votre téléphone et saisissez le code actuel."
            : "Code de secours incorrect ou déjà utilisé.",
        );
        setCode("");
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      setFormError(presentError(err).message);
    }
  };

  if (recoveryUser) {
    return (
      <div className="flex flex-col gap-5">
        <Alert tone="warning" title="Code de secours utilisé">
          Ce code ne fonctionnera plus. S&apos;il vous reste peu de codes, générez-en de nouveaux
          depuis la rubrique Sécurité de votre compte.
        </Alert>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          iconRight={<ArrowRight />}
          onClick={() => {
            router.replace(sessionDestination(next, recoveryUser));
            router.refresh();
          }}
        >
          Continuer
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-label="Vérification en deux étapes"
      className="flex flex-col gap-5"
    >
      <div className="flex items-start gap-3 text-sm text-ink-soft">
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-blue-line bg-blue-soft text-brand-blue-text [&_svg]:size-5"
        >
          {mode === "totp" ? <ShieldCheck /> : <LifeBuoy />}
        </span>
        <p className="leading-relaxed">
          {mode === "totp"
            ? "Saisissez le code à 6 chiffres affiché par votre application d'authentification."
            : "Saisissez l'un de vos codes de secours. Chaque code ne sert qu'une fois."}
          {info ? (
            <>
              {" "}
              Compte : <span className="font-medium break-all text-ink-strong">{info.email}</span>.
            </>
          ) : null}
        </p>
      </div>

      {expired ? (
        <Alert tone="warning" title="Vérification expirée">
          Le délai est dépassé.{" "}
          <Link href={expiredLoginHref(next)} className="font-medium underline underline-offset-4">
            Reconnectez-vous
          </Link>
          .
        </Alert>
      ) : null}
      {formError ? (
        <Alert tone="danger" live="alert">
          {formError}
        </Alert>
      ) : null}

      <Field
        label={mode === "totp" ? "Code de vérification" : "Code de secours"}
        error={fieldError}
        id="verification-code"
        required
        hint={
          remaining !== null && !expired ? (
            <span aria-live="off">Temps restant : {formatRemaining(remaining)}</span>
          ) : undefined
        }
      >
        <CodeInput
          ref={inputRef}
          mode={mode}
          value={code}
          onValueChange={(v) => {
            setCode(v);
            if (fieldError) setFieldError(null);
          }}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Vérification…"
        iconRight={<KeyRound />}
        disabledReason={expired ? "La vérification a expiré." : null}
      >
        Vérifier
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.875rem]">
        <button
          type="button"
          onClick={switchMode}
          className="inline-flex min-h-touch items-center rounded-sm font-medium text-brand-blue-text underline-offset-4 hover:underline"
        >
          {mode === "totp" ? "Utiliser un code de secours" : "Utiliser l'application"}
        </button>
        <Link
          href={next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion"}
          className="inline-flex min-h-touch items-center rounded-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Changer de compte
        </Link>
      </div>
    </form>
  );
}
