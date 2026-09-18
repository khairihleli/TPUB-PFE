"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { CodeInput } from "@/components/account/code-input";
import {
  RecoveryCodesList,
  useKeptCodesConfirmation,
} from "@/components/account/recovery-codes-dialog";
import { TotpSetupPanel } from "@/components/account/totp-setup-panel";
import {
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
import { expiredLoginHref } from "@/components/auth/totp-verification-form";
import { useNow } from "@/components/player/use-now";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { sessionApi } from "@/lib/api/endpoints";
import { hasErrorCode, isChallengeExpiredError, presentError } from "@/lib/api/errors";
import type { SessionEnrolmentResult, TotpSetupResponse } from "@/lib/api/types";

export const ENROLMENT_STEPS = [
  { id: "scan", label: "Scanner le QR code" },
  { id: "code", label: "Confirmer le code" },
  { id: "codes", label: "Codes de secours" },
] as const;

/**
 * /connexion/activer-2fa — mandatory enrolment for staff roles (docs/round2-contract.md §3.7):
 * 1. QR code + secret, 2. first code, 3. recovery codes (kept confirmation required), then the
 * session opened by the backend is used.
 */
export function TotpEnrolmentFlow({ next }: { next: string | null }) {
  const router = useRouter();
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [setupError, setSetupError] = useState<unknown>(null);
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<SessionEnrolmentResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { kept, checkbox } = useKeptCodesConfirmation();
  const now = useNow(done === null);

  const leaveExpired = useCallback(() => {
    clearChallengeInfo();
    router.replace(expiredLoginHref(next));
  }, [next, router]);

  const loadSetup = useCallback(
    async (signal?: AbortSignal) => {
      setSetupError(null);
      try {
        setSetup(await sessionApi.enrolmentSetup({ signal }));
      } catch (e) {
        if (signal?.aborted) return;
        if (isChallengeExpiredError(e)) {
          leaveExpired();
          return;
        }
        setSetupError(e);
      }
    },
    [leaveExpired],
  );

  useEffect(() => {
    setInfo(readChallengeInfo("TOTP_ENROLMENT_REQUIRED"));
    const controller = new AbortController();
    // Macrotask: StrictMode's mount → unmount → mount never creates two pending secrets.
    const timer = window.setTimeout(() => void loadSetup(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSetup]);

  const remaining = info && now !== null ? secondsUntilIso(info.expiresAt, now) : null;
  const step = done ? 2 : setup ? 1 : 0;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    const problem = codeError(code, "totp");
    if (problem) {
      setFieldError(problem);
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    try {
      const result = await sessionApi.enrolmentEnable(codeForSubmit(code, "totp"));
      clearChallengeInfo();
      setDone(result);
    } catch (err) {
      if (isChallengeExpiredError(err)) {
        leaveExpired();
        return;
      }
      if (hasErrorCode(err, "TOTP_CODE_INVALID")) {
        setFieldError("Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.");
        setCode("");
        inputRef.current?.focus();
      } else {
        setFormError(presentError(err).message);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        steps={ENROLMENT_STEPS.map((item) => item.label)}
        current={step}
        label="Étapes de l'activation"
      />

      {remaining !== null && !done ? (
        <p className="text-[0.8125rem] text-muted" aria-live="off">
          {remaining > 0 ? (
            <>Temps restant pour terminer : {formatRemaining(remaining)}</>
          ) : (
            <>
              Délai dépassé.{" "}
              <Link href={expiredLoginHref(next)} className="text-brand-blue-text underline">
                Reconnectez-vous
              </Link>
              .
            </>
          )}
        </p>
      ) : null}

      {done ? (
        <section aria-labelledby="enrolment-codes-title" className="flex flex-col gap-4">
          <h2 id="enrolment-codes-title" className="font-label text-[1rem] font-semibold text-ink-strong">
            3. Conservez vos codes de secours
          </h2>
          <RecoveryCodesList codes={done.recoveryCodes} email={done.user.email} />
          {checkbox}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            iconRight={<ArrowRight />}
            disabledReason={kept ? null : "Confirmez d'abord la conservation des codes."}
            onClick={() => {
              router.replace(sessionDestination(next, done.user));
              router.refresh();
            }}
          >
            Accéder à mon espace
          </Button>
        </section>
      ) : setupError ? (
        <ErrorState error={setupError} onRetry={() => void loadSetup()} scope="section" />
      ) : !setup ? (
        <LoadingRegion label="Préparation de la double authentification…">
          <Skeleton className="h-52 rounded-card" />
        </LoadingRegion>
      ) : (
        <>
          <section aria-labelledby="enrolment-scan-title" className="flex flex-col gap-4">
            <h2 id="enrolment-scan-title" className="font-label text-[1rem] font-semibold text-ink-strong">
              1. Ajoutez ZELQANE à votre application
            </h2>
            <TotpSetupPanel setup={setup} />
          </section>
          <form
            noValidate
            onSubmit={(e) => void onSubmit(e)}
            aria-labelledby="enrolment-code-title"
            className="flex flex-col gap-4"
          >
            <h2 id="enrolment-code-title" className="font-label text-[1rem] font-semibold text-ink-strong">
              2. Saisissez le code affiché
            </h2>
            {formError ? (
              <Alert tone="danger" live="alert">
                {formError}
              </Alert>
            ) : null}
            <Field label="Code à 6 chiffres" id="enrolment-code" error={fieldError} required>
              <CodeInput
                ref={inputRef}
                mode="totp"
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
              loadingLabel="Activation…"
              iconRight={<ShieldCheck />}
            >
              Activer la double authentification
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
