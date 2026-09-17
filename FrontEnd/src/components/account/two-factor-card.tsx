"use client";

import { RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { CodeInput } from "@/components/account/code-input";
import { RecoveryCodesDialog } from "@/components/account/recovery-codes-dialog";
import { TotpSetupPanel } from "@/components/account/totp-setup-panel";
import {
  type CodeMode,
  codeError,
  codeForSubmit,
  recoveryCodesRemainingLabel,
} from "@/components/account/two-factor-model";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Field, PasswordInput } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { meApi } from "@/lib/api/endpoints";
import { hasErrorCode, presentError } from "@/lib/api/errors";
import type { TotpSetupResponse, TwoFactorStatusResponse } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export const TWO_FACTOR_RESOURCE = "account:2fa";

/** Codes of the enable / regenerate / disable calls that concern the typed code. */
const INVALID_CODE_MESSAGE = "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.";

/**
 * « Double authentification » card (docs/round2-contract.md §3.3, §3.7): status, inline
 * activation (QR code → first code → recovery codes), regeneration of the recovery codes and
 * deactivation (password + code), refused when the role requires 2FA.
 */
export function TwoFactorCard({ email }: { email: string }) {
  const { toast } = useToast();
  const status = useResource(TWO_FACTOR_RESOURCE, (signal) => meApi.twoFactor({ signal }));
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [codesTitle, setCodesTitle] = useState("Vos codes de secours");
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const start = async () => {
    setStartError(null);
    setStarting(true);
    try {
      setSetup(await meApi.twoFactorSetup());
    } catch (e) {
      if (hasErrorCode(e, "TOTP_ALREADY_ENABLED")) status.reload();
      setStartError(presentError(e).message);
    } finally {
      setStarting(false);
    }
  };

  const data = status.data;

  return (
    <Card as="section" aria-labelledby="two-factor-title">
      <CardHeader
        title={<span id="two-factor-title">Double authentification</span>}
        description="Un code à 6 chiffres de votre application d'authentification est demandé à chaque connexion."
        icon={<ShieldCheck />}
      />
      {status.error && !data ? (
        <ErrorState error={status.error} onRetry={status.reload} scope="section" />
      ) : !data ? (
        <LoadingRegion label="Chargement de la double authentification…">
          <Skeleton className="h-20 rounded-card" />
        </LoadingRegion>
      ) : (
        <div className="flex flex-col gap-4">
          <StatusLine status={data} />

          {data.enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<RefreshCw aria-hidden="true" />}
                onClick={() => setRegenerateOpen(true)}
              >
                Générer de nouveaux codes de secours
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<ShieldOff aria-hidden="true" />}
                disabledReason={
                  data.required
                    ? "La double authentification est obligatoire pour votre rôle."
                    : null
                }
                onClick={() => setDisableOpen(true)}
              >
                Désactiver
              </Button>
            </div>
          ) : setup ? (
            <EnableForm
              setup={setup}
              onCancel={() => setSetup(null)}
              onRestart={() => void start()}
              onEnabled={(recoveryCodes) => {
                setSetup(null);
                setCodesTitle("Double authentification activée");
                setCodes(recoveryCodes);
                status.reload();
                toast({ title: "Double authentification activée", variant: "success" });
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {startError ? (
                <Alert tone="danger" title="Activation impossible">
                  {startError}
                </Alert>
              ) : null}
              <div>
                <Button
                  variant="primary"
                  iconLeft={<ShieldCheck aria-hidden="true" />}
                  loading={starting}
                  loadingLabel="Préparation…"
                  onClick={() => void start()}
                >
                  Activer la double authentification
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <CodeDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="Générer de nouveaux codes de secours ?"
        description="Les codes actuels ne fonctionneront plus. Confirmez avec le code de votre application."
        confirmLabel="Générer les codes"
        withPassword={false}
        onSubmit={async ({ code }) => {
          const res = await meApi.regenerateRecoveryCodes(code);
          setCodesTitle("Nouveaux codes de secours");
          setCodes(res.recoveryCodes);
          status.reload();
        }}
      />
      <CodeDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Désactiver la double authentification ?"
        description="Votre compte ne sera plus protégé que par son mot de passe. Vos autres appareils seront déconnectés."
        confirmLabel="Désactiver"
        withPassword
        allowRecovery
        onSubmit={async ({ code, password }) => {
          await meApi.twoFactorDisable({ password, code });
          status.reload();
          toast({ title: "Double authentification désactivée", variant: "success" });
        }}
      />
      <RecoveryCodesDialog
        open={codes !== null}
        codes={codes ?? []}
        email={email}
        title={codesTitle}
        onClose={() => setCodes(null)}
      />
    </Card>
  );
}

function StatusLine({ status }: { status: TwoFactorStatusResponse }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {status.enabled ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Inactive</Badge>
        )}
        {status.required ? <Badge tone="warning">Obligatoire pour votre rôle</Badge> : null}
        {status.enabled && status.enabledAt ? (
          <span className="text-muted">depuis le {formatDateTime(status.enabledAt)}</span>
        ) : null}
      </p>
      {status.enabled ? (
        <p
          className={
            status.recoveryCodesRemaining <= 2 ? "text-sm text-warning" : "text-sm text-muted"
          }
        >
          {recoveryCodesRemainingLabel(status.recoveryCodesRemaining)}
          {status.recoveryCodesRemaining <= 2 ? " : générez-en de nouveaux." : "."}
        </p>
      ) : status.required ? (
        <Alert tone="warning" live="none">
          Votre rôle impose la double authentification : elle vous sera demandée à la prochaine
          connexion. Activez-la dès maintenant.
        </Alert>
      ) : null}
    </div>
  );
}

function EnableForm({
  setup,
  onCancel,
  onRestart,
  onEnabled,
}: {
  setup: TotpSetupResponse;
  onCancel: () => void;
  onRestart: () => void;
  onEnabled: (recoveryCodes: string[]) => void;
}) {
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      const res = await meApi.twoFactorEnable(codeForSubmit(code, "totp"));
      onEnabled(res.recoveryCodes);
    } catch (err) {
      if (hasErrorCode(err, "TOTP_CODE_INVALID")) {
        setFieldError(INVALID_CODE_MESSAGE);
        setCode("");
        inputRef.current?.focus();
      } else if (hasErrorCode(err, "TOTP_SETUP_REQUIRED")) {
        setExpired(true);
      } else {
        setFormError(presentError(err).message);
      }
    } finally {
      setPending(false);
    }
  };

  if (expired) {
    return (
      <Alert tone="warning" title="Configuration expirée">
        <p>Le QR code n&apos;est valable que 10 minutes.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRestart}>
          Générer un nouveau QR code
        </Button>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-card border border-line bg-overlay-inset p-4 sm:p-5">
      <TotpSetupPanel setup={setup} />
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {formError ? (
          <Alert tone="danger" live="alert">
            {formError}
          </Alert>
        ) : null}
        <Field label="Code à 6 chiffres" id="two-factor-enable-code" error={fieldError} required>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Activation…">
            Confirmer et activer
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
        </div>
      </form>
    </div>
  );
}

interface CodeDialogValues {
  code: string;
  password: string;
}

function CodeDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  withPassword,
  allowRecovery = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  withPassword: boolean;
  /** Accept a recovery code instead of the TOTP code (deactivation only). */
  allowRecovery?: boolean;
  onSubmit: (values: CodeDialogValues) => Promise<void>;
}) {
  const [mode, setMode] = useState<CodeMode>("totp");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setMode("totp");
    setCode("");
    setPassword("");
    setCodeErr(null);
    setPasswordErr(null);
    setFormError(null);
  };

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    const pwProblem = withPassword && password.length === 0 ? "Ce champ est requis." : null;
    const codeProblem = codeError(code, mode);
    setPasswordErr(pwProblem);
    setCodeErr(codeProblem);
    if (pwProblem || codeProblem) return;
    setPending(true);
    try {
      await onSubmit({ code: codeForSubmit(code, mode), password });
      setPending(false);
      reset();
      onOpenChange(false);
    } catch (err) {
      setPending(false);
      if (hasErrorCode(err, "TOTP_CODE_INVALID")) {
        setCodeErr(mode === "totp" ? INVALID_CODE_MESSAGE : "Code de secours incorrect ou déjà utilisé.");
        setCode("");
      } else if (hasErrorCode(err, "INVALID_CURRENT_PASSWORD")) {
        setPasswordErr("Mot de passe actuel incorrect.");
      } else {
        setFormError(presentError(err).message);
      }
    }
  };

  const formId = `code-dialog-${confirmLabel.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        preventOutsideClose={pending}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={withPassword ? "danger" : "primary"}
              loading={pending}
              loadingLabel="Vérification…"
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          {formError ? (
            <Alert tone="danger" live="alert">
              {formError}
            </Alert>
          ) : null}
          {withPassword ? (
            <Field label="Mot de passe actuel" id={`${formId}-password`} error={passwordErr} required>
              <PasswordInput
                name="password"
                autoComplete="current-password"
                maxLength={100}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordErr) setPasswordErr(null);
                }}
              />
            </Field>
          ) : null}
          <Field
            label={mode === "totp" ? "Code à 6 chiffres" : "Code de secours"}
            id={`${formId}-code`}
            error={codeErr}
            required
          >
            <CodeInput
              mode={mode}
              value={code}
              onValueChange={(v) => {
                setCode(v);
                if (codeErr) setCodeErr(null);
              }}
            />
          </Field>
          {allowRecovery ? (
            <button
              type="button"
              className="self-start text-[0.8125rem] text-brand-blue-text underline-offset-2 hover:underline"
              onClick={() => {
                setMode((m) => (m === "totp" ? "recovery" : "totp"));
                setCode("");
                setCodeErr(null);
              }}
            >
              {mode === "totp" ? "Utiliser un code de secours" : "Utiliser le code de l'application"}
            </button>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
