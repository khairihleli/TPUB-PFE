"use client";

import { ArrowRight, CircleCheck, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { postAuthDestination, withNext } from "@/components/auth/auth-redirect";
import {
  firstIssues,
  type FieldErrorsOf,
  PASSWORD_MAX,
  passwordStrength,
  registerSchema,
  type RegisterValues,
} from "@/components/auth/auth-schemas";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { ApiError, presentError, sessionApi, type SessionUser } from "@/lib/api";
import { cx } from "@/lib/cx";

const FIELDS = [
  "nom",
  "societe",
  "email",
  "telephone",
  "adresse",
  "password",
  "consentement",
] as const;
type FieldName = (typeof FIELDS)[number];
type Errors = FieldErrorsOf<RegisterValues>;
type TextValues = Omit<RegisterValues, "consentement">;

const EMAIL_TAKEN = "Un compte existe déjà avec cet e-mail.";
const REDIRECT_DELAY_MS = 2600;

const SEGMENT_TONE = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"] as const;
const LABEL_TONE = [
  "text-danger",
  "text-danger",
  "text-warning",
  "text-info",
  "text-success",
] as const;

function StrengthMeter({ password }: { password: string }) {
  const s = useMemo(() => passwordStrength(password), [password]);
  if (!password) return null;
  return (
    <div className="flex items-center gap-3" id="register-password-strength">
      <div aria-hidden="true" className="grid flex-1 grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx(
              "h-1 rounded-full transition-colors duration-300 ease-smooth",
              s.level >= i ? SEGMENT_TONE[s.level] : "bg-line-strong",
            )}
          />
        ))}
      </div>
      <p
        className={cx("min-w-[5.5rem] text-right text-[0.75rem] font-medium", LABEL_TONE[s.level])}
      >
        <span className="sr-only">Robustesse du mot de passe : </span>
        <span aria-live="polite">{s.label}</span>
      </p>
    </div>
  );
}

export interface RegisterFormProps {
  next: string | null;
}

export function RegisterForm({ next }: RegisterFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<TextValues>({
    nom: "",
    societe: "",
    email: "",
    telephone: "",
    adresse: "",
    password: "",
  });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; emailTaken?: boolean } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<SessionUser | null>(null);
  const busy = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const successRef = useRef<HTMLHeadingElement | null>(null);

  const destination = created ? postAuthDestination(next, created.role) : null;

  useEffect(() => {
    if (!destination) return;
    successRef.current?.focus();
    const t = setTimeout(() => {
      router.replace(destination);
      router.refresh();
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [destination, router]);

  function set(key: Exclude<FieldName, "consentement">, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusField(errs: Errors) {
    const first = FIELDS.find((f) => errs[f]);
    if (first) document.getElementById(`register-${first}`)?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);

    const parsed = registerSchema.safeParse({ ...values, consentement: consent });
    if (!parsed.success) {
      const errs = firstIssues<RegisterValues>(parsed.error, FIELDS);
      setErrors(errs);
      requestAnimationFrame(() => focusField(errs));
      return;
    }

    busy.current = true;
    setPending(true);
    const { consentement: _consent, adresse, ...rest } = parsed.data;
    try {
      const { user } = await sessionApi.register({
        ...rest,
        ...(adresse ? { adresse } : {}),
      });
      setCreated(user);
    } catch (err) {
      busy.current = false;
      setPending(false);
      if (err instanceof ApiError && err.status === 400) {
        if ((err.rawMessage ?? "").startsWith("Email already registered")) {
          const errs: Errors = { email: EMAIL_TAKEN };
          setErrors(errs);
          setFormError({ message: EMAIL_TAKEN, emailTaken: true });
          requestAnimationFrame(() => focusField(errs));
          return;
        }
        const errs: Errors = {};
        for (const f of FIELDS) if (err.fieldErrors[f]) errs[f] = err.fieldErrors[f];
        if (Object.keys(errs).length) {
          setErrors(errs);
          requestAnimationFrame(() => focusField(errs));
          return;
        }
      }
      setFormError({ message: presentError(err).message });
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  if (created && destination) {
    return (
      <div role="status" className="flex flex-col items-start gap-5">
        <span
          aria-hidden="true"
          className="inline-flex size-14 items-center justify-center rounded-full border border-success/35 bg-success/10 text-success [&_svg]:size-7"
        >
          <CircleCheck />
        </span>
        <h2
          ref={successRef}
          tabIndex={-1}
          className="font-display text-h3 text-ink-strong focus:outline-none"
        >
          Bienvenue, {created.nom}
        </h2>
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
          Votre compte est créé. Votre dossier est en cours d&apos;examen : vous pouvez déjà
          explorer les zones et préparer une campagne en brouillon.
        </p>
        <p className="text-[0.8125rem] text-muted">Redirection vers votre espace…</p>
        <Link
          href={destination}
          className={buttonClasses({ variant: "brand", size: "lg", fullWidth: true })}
        >
          Accéder à mon espace
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void onSubmit(e)}
      aria-label="Création du compte annonceur"
      className="flex flex-col gap-5"
    >
      {formError ? (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <Alert
            tone="danger"
            live="alert"
            action={
              formError.emailTaken ? (
                <Link
                  href={withNext("/connexion", next)}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Se connecter
                </Link>
              ) : undefined
            }
          >
            {formError.message}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Prénom et nom" required error={errors.nom} id="register-nom">
          <Input
            name="nom"
            autoComplete="name"
            value={values.nom}
            onChange={(e) => set("nom", e.target.value)}
            maxLength={150}
          />
        </Field>
        <Field label="Société" required error={errors.societe} id="register-societe">
          <Input
            name="societe"
            autoComplete="organization"
            value={values.societe}
            onChange={(e) => set("societe", e.target.value)}
            maxLength={200}
          />
        </Field>
      </div>

      <Field label="E-mail professionnel" required error={errors.email} id="register-email">
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          maxLength={255}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Téléphone" required error={errors.telephone} id="register-telephone">
          <Input
            name="telephone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.telephone}
            onChange={(e) => set("telephone", e.target.value)}
            maxLength={30}
          />
        </Field>
        <Field label="Adresse" error={errors.adresse} id="register-adresse">
          <Input
            name="adresse"
            autoComplete="street-address"
            value={values.adresse}
            onChange={(e) => set("adresse", e.target.value)}
            maxLength={500}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field
          label="Mot de passe"
          required
          hint="8 caractères minimum."
          error={errors.password}
          id="register-password"
        >
          <PasswordInput
            name="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            maxLength={PASSWORD_MAX}
          />
        </Field>
        <StrengthMeter password={values.password} />
      </div>

      <Checkbox
        id="register-consentement"
        name="consentement"
        checked={consent}
        onChange={(e) => {
          setConsent(e.target.checked);
          if (errors.consentement) setErrors((x) => ({ ...x, consentement: undefined }));
        }}
        error={errors.consentement}
        label={
          <>
            J&apos;accepte les{" "}
            <Link
              href="/cgu"
              target="_blank"
              className="text-brand-blue-text underline underline-offset-4 hover:text-ink-strong"
            >
              CGU<span className="sr-only"> (nouvel onglet)</span>
            </Link>{" "}
            et la{" "}
            <Link
              href="/confidentialite"
              target="_blank"
              className="text-brand-blue-text underline underline-offset-4 hover:text-ink-strong"
            >
              politique de confidentialité<span className="sr-only"> (nouvel onglet)</span>
            </Link>
            .
          </>
        }
      />

      <Button
        type="submit"
        variant="brand"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Création du compte…"
        iconRight={<UserPlus />}
      >
        Créer mon compte
      </Button>

      <p className="flex gap-3 rounded-card border border-line bg-surface/40 px-4 py-3.5 text-[0.8125rem] leading-relaxed text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
        Pour protéger l&apos;espace public, chaque compte annonceur est examiné par ZELQANE avant la
        diffusion de sa première campagne.
      </p>
    </form>
  );
}
