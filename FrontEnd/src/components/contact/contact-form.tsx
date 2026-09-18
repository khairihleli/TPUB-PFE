"use client";

import {
  ArrowRight,
  Briefcase,
  CircleCheck,
  CircleEllipsis,
  Landmark,
  Lightbulb,
  MapPin,
  Megaphone,
  RotateCcw,
  Send,
  Store,
} from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CONTACT_FIELD_ORDER,
  type ContactField,
  type ContactFieldErrors,
  type ContactNeed,
  type ContactPrefill,
  type ContactProfile,
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  NEED_OPTIONS,
  needLabel,
  PROFILE_OPTIONS,
  profileLabel,
  validateContact,
} from "@/components/contact/contact-schema";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CONTACT } from "@/content/site";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";

interface FormValues {
  nom: string;
  email: string;
  telephone: string;
  societe: string;
  profil: ContactProfile | "";
  besoin: ContactNeed | "";
  zones: string;
  periode: string;
  message: string;
  consentement: boolean;
  [HONEYPOT_FIELD]: string;
}

type Status = "idle" | "submitting" | "success";

const SUCCESS_COPY =
  "Merci, votre demande est bien envoyée. L'équipe ZELQANE revient vers vous par e-mail.";
const ERROR_COPY = `L'envoi n'a pas abouti. Réessayez ou écrivez-nous à ${CONTACT.email}.`;

const PROFILE_ICON: Record<ContactProfile, ReactNode> = {
  commerce: <Store />,
  marque: <Megaphone />,
  agence: <Briefcase />,
  institution: <Landmark />,
  proprietaire: <MapPin />,
  autre: <CircleEllipsis />,
};

function fieldId(field: ContactField): string {
  return field === "profil" ? `contact-profil-${PROFILE_OPTIONS[0].value}` : `contact-${field}`;
}

/** Contextual guidance: routes each profile / need to the right next step (brief §4). */
function routingHint(profil: FormValues["profil"], besoin: FormValues["besoin"]): ReactNode {
  if (profil === "institution" || besoin === "interet-general") {
    return (
      <>
        Les messages d&apos;intérêt général sont conçus pour passer en priorité, avant toute
        publicité, dans la zone concernée. Ils sont créés par l&apos;équipe ZELQANE, pas en
        libre-service : décrivez la zone et la période visées.
      </>
    );
  }
  if (profil === "proprietaire" || besoin === "emplacement") {
    return (
      <>
        Vous détenez des emplacements ? Indiquez leur localisation et leur configuration : nous
        étudions avec vous ce qui est envisageable.
      </>
    );
  }
  if (profil === "agence" || besoin === "plan-media") {
    return (
      <>
        Pour un plan média, précisez vos objectifs, vos cibles, vos zones et vos périodes. Nous
        indiquons ce qui sera prouvé et ce qui sera estimé.
      </>
    );
  }
  if (profil === "commerce") {
    return (
      <>
        Vous pouvez aussi préparer votre campagne vous-même :{" "}
        <Link
          href="/inscription"
          className="text-brand-blue-text underline underline-offset-4 hover:text-ink-strong"
        >
          créer un compte annonceur
        </Link>
        .
      </>
    );
  }
  if (profil === "marque") {
    return (
      <>
        Plusieurs zones, plusieurs périodes : décrivez vos temps forts, nous revenons vers vous avec
        une proposition adaptée.
      </>
    );
  }
  return null;
}

function initialValues(prefill: ContactPrefill): FormValues {
  return {
    nom: "",
    email: "",
    telephone: "",
    societe: "",
    profil: prefill.profil,
    besoin: prefill.besoin,
    zones: "",
    periode: "",
    message: "",
    consentement: false,
    [HONEYPOT_FIELD]: "",
  };
}

function GroupTitle({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-brand-orange-text tabular">
        {index}
      </span>
      <span className="font-label text-[0.8125rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
        {children}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

export interface ContactFormProps {
  initial: ContactPrefill;
}

export function ContactForm({ initial }: ContactFormProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(initial));
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const busy = useRef(false);
  const successRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // A persona link (« Par où commencer ») changes ?profil=&besoin= on the same page: apply the
  // new pre-fill without remounting, so what the visitor already typed is kept.
  const [appliedPrefill, setAppliedPrefill] = useState(initial);
  if (appliedPrefill.profil !== initial.profil || appliedPrefill.besoin !== initial.besoin) {
    setAppliedPrefill(initial);
    if (status === "success") {
      setValues(initialValues(initial));
      setStatus("idle");
    } else {
      setValues((v) => ({
        ...v,
        profil: initial.profil || v.profil,
        besoin: initial.besoin || v.besoin,
      }));
    }
    setErrors((e) => {
      const next = { ...e };
      if (initial.profil) delete next.profil;
      if (initial.besoin) delete next.besoin;
      return next;
    });
  }

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (key in errors) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as ContactField];
        return next;
      });
    }
  }

  const onText =
    (key: "nom" | "email" | "telephone" | "societe" | "zones" | "periode" | "message") =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, e.target.value);

  function focusFirstError(errs: ContactFieldErrors) {
    const first = CONTACT_FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el =
      first === "profil"
        ? (document.querySelector<HTMLInputElement>('input[name="profil"]:checked') ??
          document.getElementById(fieldId("profil")))
        : document.getElementById(fieldId(first));
    el?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    setFormError(null);

    const result = validateContact(values);
    if (!result.ok) {
      setErrors(result.errors);
      requestAnimationFrame(() => focusFirstError(result.errors));
      return;
    }

    busy.current = true;
    setStatus("submitting");
    try {
      await apiFetch<{ ok: true }>("/api/contact", {
        method: "POST",
        body: { ...result.data, [HONEYPOT_FIELD]: values[HONEYPOT_FIELD] },
      });
      setErrors({});
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      if (err instanceof ApiError && err.status === 400) {
        const raw = (err.body as { errors?: unknown } | undefined)?.errors;
        const mapped: ContactFieldErrors = {};
        if (raw && typeof raw === "object") {
          for (const f of CONTACT_FIELD_ORDER) {
            const m = (raw as Record<string, unknown>)[f];
            if (typeof m === "string") mapped[f] = m;
          }
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          requestAnimationFrame(() => focusFirstError(mapped));
          return;
        }
      }
      setFormError(
        err instanceof ApiError && (err.status === 429 || err.status === 413)
          ? err.message
          : ERROR_COPY,
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      busy.current = false;
    }
  }

  function reset() {
    setValues(initialValues({ profil: "", besoin: "" }));
    setErrors({});
    setFormError(null);
    setStatus("idle");
  }

  if (status === "success") {
    const p = profileLabel(values.profil);
    const b = needLabel(values.besoin);
    return (
      <div role="status" className="flex flex-col items-start gap-6 py-4 sm:py-8">
        <span
          aria-hidden="true"
          className="relative inline-flex size-16 items-center justify-center rounded-full border border-success/35 bg-success/10 text-success [&_svg]:size-8"
        >
          <span className="absolute inset-0 animate-fade-in rounded-full shadow-[0_0_0_10px_color-mix(in_srgb,var(--color-success)_8%,transparent)]" />
          <CircleCheck />
        </span>
        <div className="flex flex-col gap-3">
          <h2
            ref={successRef}
            tabIndex={-1}
            className="font-display text-h2 text-ink-strong focus:outline-none"
          >
            Demande envoyée
          </h2>
          <p className="max-w-[52ch] text-lead text-ink-soft">{SUCCESS_COPY}</p>
        </div>
        {p || b ? (
          <dl className="grid w-full gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
            {p ? (
              <div className="bg-surface/80 px-5 py-4">
                <dt className="text-[0.75rem] tracking-[0.14em] text-muted uppercase">Profil</dt>
                <dd className="mt-1 font-label text-ink-strong">{p}</dd>
              </div>
            ) : null}
            {b ? (
              <div className="bg-surface/80 px-5 py-4">
                <dt className="text-[0.75rem] tracking-[0.14em] text-muted uppercase">Besoin</dt>
                <dd className="mt-1 font-label text-ink-strong">{b}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="text-sm text-muted">
          Une réponse sera envoyée à <span className="text-ink">{values.email}</span>.
        </p>
        <div className="flex w-full flex-col gap-3 min-[460px]:w-auto min-[460px]:flex-row">
          <Link href="/inscription" className={buttonClasses({ variant: "brand", size: "lg" })}>
            Créer mon compte annonceur
            <ArrowRight aria-hidden="true" />
          </Link>
          <Button variant="ghost" size="lg" iconLeft={<RotateCcw />} onClick={reset}>
            Envoyer une autre demande
          </Button>
        </div>
      </div>
    );
  }

  const hint = routingHint(values.profil, values.besoin);
  const submitting = status === "submitting";

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} aria-labelledby="contact-form-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="contact-form-title" className="font-display text-h3 text-ink-strong">
          Votre demande
        </h2>
        <p className="text-[0.8125rem] text-muted">
          <span aria-hidden="true" className="text-brand-orange-text">
            *
          </span>{" "}
          Champs obligatoires
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-10">
        {/* 01 — Vous */}
        <div className="flex flex-col gap-5">
          <GroupTitle index="01">Vous</GroupTitle>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Nom et prénom" required error={errors.nom} id="contact-nom">
              <Input
                name="nom"
                autoComplete="name"
                value={values.nom}
                onChange={onText("nom")}
                maxLength={150}
              />
            </Field>
            <Field label="E-mail professionnel" required error={errors.email} id="contact-email">
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                value={values.email}
                onChange={onText("email")}
                maxLength={255}
              />
            </Field>
            <Field label="Téléphone" error={errors.telephone} id="contact-telephone">
              <Input
                name="telephone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={values.telephone}
                onChange={onText("telephone")}
                maxLength={30}
              />
            </Field>
            <Field label="Société / agence" error={errors.societe} id="contact-societe">
              <Input
                name="societe"
                autoComplete="organization"
                value={values.societe}
                onChange={onText("societe")}
                maxLength={200}
              />
            </Field>
          </div>
        </div>

        {/* 02 — Votre projet */}
        <div className="flex flex-col gap-5">
          <GroupTitle index="02">Votre projet</GroupTitle>

          <fieldset
            className="flex min-w-0 flex-col gap-3"
            aria-describedby={errors.profil ? "contact-profil-error" : undefined}
          >
            <legend className="mb-3 font-label text-[0.8125rem] font-medium tracking-[0.01em] text-ink-soft">
              Vous êtes
              <span aria-hidden="true" className="ml-0.5 text-brand-orange-text">
                *
              </span>
              <span className="sr-only"> (obligatoire)</span>
            </legend>
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-3">
              {PROFILE_OPTIONS.map((o) => {
                const checked = values.profil === o.value;
                return (
                  <label
                    key={o.value}
                    className={cx(
                      "group/chip relative flex min-h-13 cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2.5 text-[0.875rem] transition-[border-color,background-color,color] duration-200 ease-smooth has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                      checked
                        ? "border-orange-line bg-orange-soft text-ink-strong"
                        : errors.profil
                          ? "border-danger/50 bg-black/20 text-ink-soft hover:border-danger/70"
                          : "border-line-strong bg-black/20 text-ink-soft hover:border-white/25 hover:text-ink",
                    )}
                  >
                    <input
                      id={`contact-profil-${o.value}`}
                      type="radio"
                      name="profil"
                      value={o.value}
                      checked={checked}
                      onChange={() => set("profil", o.value)}
                      aria-describedby={errors.profil ? "contact-profil-error" : undefined}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cx(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] border transition-colors [&_svg]:size-4",
                        checked
                          ? "border-orange-line bg-brand-orange text-on-orange"
                          : "border-line bg-surface-2 text-muted group-hover/chip:text-ink-soft",
                      )}
                    >
                      {PROFILE_ICON[o.value]}
                    </span>
                    <span className="leading-snug">{o.label}</span>
                  </label>
                );
              })}
            </div>
            {errors.profil ? (
              <p
                id="contact-profil-error"
                role="alert"
                className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-danger"
                />
                {errors.profil}
              </p>
            ) : null}
          </fieldset>

          <Field label="Votre besoin" required error={errors.besoin} id="contact-besoin">
            <Select
              name="besoin"
              value={values.besoin}
              onChange={(e) => set("besoin", e.target.value as FormValues["besoin"])}
              placeholder="Choisir un besoin…"
            >
              {NEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <div aria-live="polite">
            {hint ? (
              <p className="flex gap-3 rounded-card border border-blue-line bg-blue-soft px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <Lightbulb
                  aria-hidden="true"
                  className="mt-0.5 size-4.5 shrink-0 text-brand-blue-text"
                />
                <span>{hint}</span>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field
              label="Zones visées"
              hint="Quartier, ville, axe…"
              error={errors.zones}
              id="contact-zones"
            >
              <Input name="zones" value={values.zones} onChange={onText("zones")} maxLength={300} />
            </Field>
            <Field
              label="Période envisagée"
              hint="Dates, saison, temps fort…"
              error={errors.periode}
              id="contact-periode"
            >
              <Input
                name="periode"
                value={values.periode}
                onChange={onText("periode")}
                maxLength={200}
              />
            </Field>
          </div>
        </div>

        {/* 03 — Message */}
        <div className="flex flex-col gap-5">
          <GroupTitle index="03">Message</GroupTitle>
          <Field
            label="Message"
            required
            error={errors.message}
            id="contact-message"
            labelAside={
              <span className="text-muted-2 tabular" aria-hidden="true">
                {values.message.length} / {MESSAGE_MAX}
              </span>
            }
          >
            <Textarea
              name="message"
              rows={6}
              placeholder="Objectif, cible, zones, dates, formats…"
              value={values.message}
              onChange={onText("message")}
              maxLength={MESSAGE_MAX}
            />
          </Field>

          {/* Honeypot: invisible to people and assistive tech; bots tend to fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="contact-site-web">Site web (laisser vide)</label>
            <input
              id="contact-site-web"
              type="text"
              name={HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              value={values[HONEYPOT_FIELD]}
              onChange={(e) => set(HONEYPOT_FIELD, e.target.value)}
            />
          </div>

          <Checkbox
            id="contact-consentement"
            name="consentement"
            checked={values.consentement}
            onChange={(e) => set("consentement", e.target.checked)}
            error={errors.consentement}
            label={
              <>
                J&apos;accepte que ZELQANE utilise ces informations pour répondre à ma demande.
                <span aria-hidden="true" className="ml-0.5 text-brand-orange-text">
                  *
                </span>
                <span className="sr-only"> (obligatoire)</span>{" "}
                <Link
                  href="/confidentialite"
                  target="_blank"
                  className="text-brand-blue-text underline underline-offset-4 hover:text-ink-strong"
                >
                  Politique de confidentialité
                  <span className="sr-only"> (nouvel onglet)</span>
                </Link>
              </>
            }
          />
        </div>

        {formError ? (
          <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
            <Alert tone="danger" title="Envoi impossible">
              {formError}
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 border-t border-line pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[40ch] text-[0.8125rem] leading-relaxed text-muted">
            Aucune réservation n&apos;est engagée par cette demande.
          </p>
          <Button
            type="submit"
            variant="brand"
            size="lg"
            loading={submitting}
            loadingLabel="Envoi en cours…"
            iconRight={<Send />}
            className="w-full sm:w-auto"
          >
            Envoyer ma demande
          </Button>
        </div>
      </div>
    </form>
  );
}
