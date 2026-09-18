"use client";

import { KeyRound } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";

import { firstIssues } from "@/components/auth/auth-schemas";
import {
  PASSWORD_ERROR_FIELD,
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_FIELDS,
  passwordChangeSchema,
  type PasswordValues,
} from "@/components/espace/profile-model";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, PasswordInput } from "@/components/ui/field";
import { meApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";

export const PASSWORD_CHANGED_NOTICE = "Vos autres sessions ont été déconnectées.";

type PasswordErrors = Partial<Record<(typeof PASSWORD_FIELDS)[number], string>>;
const EMPTY_PASSWORDS: PasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export interface PasswordChangeFormProps {
  /** Called after a successful change (e.g. refresh the session, then leave the page). */
  onChanged?: () => void | Promise<void>;
  submitLabel?: string;
  /** Replaces the « autres appareils » hint under the fields. */
  hint?: ReactNode;
  /** Shows the success alert after a change (off when `onChanged` navigates away). */
  showSuccess?: boolean;
}

/**
 * POST /me/password with the profile rules (8..100 characters, a letter and a digit, different
 * from the current one). Shared by the profile, /admin/compte and /mot-de-passe-requis.
 */
export function PasswordChangeForm({
  onChanged,
  submitLabel = "Modifier le mot de passe",
  hint = "Les autres appareils connectés seront déconnectés ; celui-ci reste connecté.",
  showSuccess = true,
}: PasswordChangeFormProps) {
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
      await onChanged?.();
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
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      {done && showSuccess ? (
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
      {hint ? <p className="text-[0.8125rem] text-muted">{hint}</p> : null}
      <div>
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Modification…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** « Mot de passe » card of the profile and of /admin/compte. */
export function PasswordChangeCard() {
  return (
    <Card as="section" aria-labelledby="password-title">
      <CardHeader
        title={<span id="password-title">Mot de passe</span>}
        description="Au moins 8 caractères, dont une lettre et un chiffre."
        icon={<KeyRound />}
      />
      <PasswordChangeForm />
    </Card>
  );
}
