"use client";

import { Lock, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseCampaignId } from "@/components/campaign/campaign-actions";
import {
  type CampaignWithReservations,
  isCampaignNotFound,
  loadCampaignWithReservations,
} from "@/components/campaign/campaign-data";
import { lastActivityAt } from "@/components/campaign/campaign-list-model";
import { CampaignFormFields } from "@/components/campaign/campaign-form-fields";
import {
  type CampaignField,
  type CampaignFormErrors,
  type CampaignFormValues,
  campaignToFormValues,
} from "@/components/campaign/campaign-schema";
import { CampaignNotFound } from "@/components/campaign/campaign-ui";
import { saveCampaign } from "@/components/campaign/step-details";
import { useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useCommandPalette } from "@/components/shell/command-palette";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ErrorSummary, type ErrorSummaryItem, focusField } from "@/components/ui/error-summary";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { campaignsApi } from "@/lib/api/endpoints";
import { editReopens, getCampaignStatusMeta, isEditable } from "@/lib/campaign-status";
import { formatCount, todayISO } from "@/lib/format";
import { useFormDraft } from "@/lib/forms/form-draft";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

const ID_PREFIX = "modifier";

/** Local draft key (UX-PLAN §7.2). */
export function editDraftKey(campaignId: number): string {
  return `campaign:${campaignId}:edit`;
}

export function sameFormValues(a: CampaignFormValues, b: CampaignFormValues): boolean {
  return (Object.keys(a) as CampaignField[]).every(
    (k) => (a[k] ?? "").trim() === (b[k] ?? "").trim(),
  );
}

/**
 * Invalid controls in DOM order with their visible error text. Reads the rendered form so the
 * summary keeps working whatever ids the shared form fields use (Field wires `aria-invalid` and
 * an `…-error` description).
 */
export function collectFieldErrors(root: ParentNode): ErrorSummaryItem[] {
  const seen = new Set<string>();
  const items: ErrorSummaryItem[] = [];
  root.querySelectorAll<HTMLElement>('[aria-invalid="true"][id]').forEach((el) => {
    if (seen.has(el.id)) return;
    seen.add(el.id);
    const describedBy = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    const errorEl = describedBy
      .map((ref) => el.ownerDocument.getElementById(ref))
      .find((node) => node?.id.endsWith("-error"));
    const label = Array.from(el.ownerDocument.querySelectorAll("label")).find(
      (l) => l.htmlFor === el.id,
    )?.textContent;
    const message =
      errorEl?.textContent?.trim() ||
      (label ? `${label.replace("*", "").trim()} : à corriger` : "Champ à corriger");
    items.push({ fieldId: el.id, message });
  });
  return items;
}

function EditForm({ data }: { data: CampaignWithReservations }) {
  const router = useRouter();
  const { toast } = useToast();
  const { campaign } = data;
  const [today] = useState(() => todayISO());
  const initial = useMemo(() => campaignToFormValues(campaign), [campaign]);
  const [baseline, setBaseline] = useState<CampaignFormValues>(initial);
  const [values, setValues] = useState<CampaignFormValues>(initial);
  const [errors, setErrors] = useState<CampaignFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ErrorSummaryItem[]>([]);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const detailHref = routes.espace.campaign(campaign.id);

  const dirty = !sameFormValues(values, baseline);
  useUnsavedChangesGuard({ dirty });
  const draft = useFormDraft<CampaignFormValues>({
    key: editDraftKey(campaign.id),
    value: values,
    dirty,
    onRestore: (restored) => setValues({ ...initial, ...restored }),
  });

  const onChange = (field: CampaignField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // After a failed submit: one error → focus it; several → summary (UX-PLAN §7.4).
  useEffect(() => {
    if (attempt === 0) return;
    const timer = window.setTimeout(() => {
      const items = formRef.current ? collectFieldErrors(formRef.current) : [];
      if (items.length === 1) {
        setSummary([]);
        focusField(items[0]!.fieldId);
      } else {
        setSummary(items);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  // Corrected fields leave the summary (it never lists an error the form no longer shows).
  useEffect(() => {
    if (!formRef.current) return;
    const stillInvalid = new Set(collectFieldErrors(formRef.current).map((i) => i.fieldId));
    setSummary((current) => {
      const next = current.filter((i) => stillInvalid.has(i.fieldId));
      return next.length === current.length ? current : next;
    });
  }, [errors]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setServerError(null);
    const result = await saveCampaign({ values, campaign, today });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.errors);
      setServerError(result.message);
      setAttempt((n) => n + 1);
      return;
    }
    setSummary([]);
    setBaseline(values);
    draft.clear();
    if (result.changed) {
      invalidate(resourceKeys.campaignsMine);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
    }
    const released = (campaign.reservationsCount ?? 0) - (result.campaign.reservationsCount ?? 0);
    const reopened =
      result.changed && result.campaign.status === "BROUILLON" && campaign.status !== "BROUILLON";
    toast({
      title: !result.changed
        ? "Aucune modification"
        : reopened
          ? "Campagne remise en brouillon"
          : "Modifications enregistrées",
      description:
        released > 0
          ? `${formatCount(released, "réservation libérée", "réservations libérées")} : hors de la nouvelle période ou du nouveau créneau.`
          : reopened
            ? "Vérifiez le contenu et les Porteurs, puis soumettez-la à nouveau."
            : undefined,
      variant: !result.changed ? "info" : released > 0 ? "warning" : "success",
    });
    router.push(reopened ? routes.espace.wizard(campaign.id, "contenu") : detailHref);
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {draft.restoredAt ? (
        <DraftRestoreNotice
          className="mb-6"
          restoredAt={draft.restoredAt}
          onDiscard={() => {
            draft.discard();
            setValues(baseline);
            setErrors({});
            setSummary([]);
          }}
        />
      ) : null}

      <ErrorSummary errors={summary} focusKey={attempt} className="mb-6" />

      {campaign.rejectionReason ? (
        <Alert tone="danger" live="none" className="mb-6" title="Motif du dernier refus">
          {campaign.rejectionReason}
        </Alert>
      ) : null}

      {editReopens(campaign.status) ? (
        <Alert
          tone="warning"
          live="none"
          className="mb-6"
          title="La campagne repassera en brouillon"
        >
          Enregistrer ces modifications remet la campagne en brouillon : vous pourrez ensuite
          corriger son contenu et ses Porteurs, puis la soumettre à nouveau à l&apos;analyse IA et à
          ZELQANE.
        </Alert>
      ) : null}

      <div className="rounded-card border border-line bg-surface p-5 sm:p-7">
        <CampaignFormFields
          values={values}
          errors={errors}
          onChange={onChange}
          today={today}
          scheduleNote={
            (campaign.reservationsCount ?? 0) > 0
              ? "Les réservations hors de la nouvelle période ou du nouveau créneau seront libérées."
              : undefined
          }
          disabled={saving}
          idPrefix={ID_PREFIX}
        />
      </div>

      {serverError ? (
        <Alert tone="danger" className="mt-5" title="Enregistrement impossible">
          {serverError}
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost">
          <Link href={detailHref}>Annuler</Link>
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving}
          loadingLabel="Enregistrement en cours"
          iconLeft={<Save aria-hidden="true" />}
        >
          Enregistrer les modifications
        </Button>
      </div>
    </form>
  );
}

function EditSkeleton({
  slow,
  onRetry,
  label,
}: {
  slow?: boolean;
  onRetry?: () => void;
  label?: string;
}) {
  return (
    <LoadingRegion label={label ?? "Chargement de la campagne…"} slow={slow} onRetry={onRetry}>
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-9 w-80 max-w-full" />
      </div>
      <Skeleton className="h-[36rem] w-full rounded-card" />
    </LoadingRegion>
  );
}

function EditNotFound() {
  const { open } = useCommandPalette();
  useDocumentTitle("Campagne introuvable");
  const { data } = useResource("campaigns-mine", (signal) => campaignsApi.mine({ signal }), {
    cacheKey: resourceKeys.campaignsMine,
    revalidateOnFocus: false,
  });
  const recent = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => Date.parse(lastActivityAt(b)) - Date.parse(lastActivityAt(a)))
        .slice(0, 3),
    [data],
  );
  return (
    <>
      <PageHeader
        title="Campagne introuvable"
        breadcrumbs={[
          { label: "Campagnes", href: routes.espace.campaigns() },
          { label: "Introuvable" },
        ]}
      />
      <CampaignNotFound recent={recent} onSearch={() => open()} showTitle={false} />
    </>
  );
}

/**
 * /espace/campagnes/[id]/modifier — one editing flow per status (IA-05): drafts are edited in
 * the wizard (redirect to « Détails »), REJECTED_BY_AI / BLOCKED here (saving reopens them to
 * BROUILLON server-side), other statuses are read-only.
 */
export function CampaignEdit({ idParam }: { idParam: string }) {
  const router = useRouter();
  const id = parseCampaignId(idParam);
  const { data, error, loading, reload, slow } = useResource(
    id === null ? null : `campaign-edit-${id}`,
    (signal) => loadCampaignWithReservations(id, signal),
    // Never refetch under a form being typed.
    { revalidateOnFocus: false },
  );
  const current = id !== null && data?.campaign.id === id ? data : null;
  const isDraft = current?.campaign.status === "BROUILLON";

  const redirect = useCallback(
    (campaignId: number) => router.replace(routes.espace.wizard(campaignId, "details")),
    [router],
  );
  useEffect(() => {
    if (current && isDraft) redirect(current.campaign.id);
  }, [current, isDraft, redirect]);

  useDocumentTitle(current ? `Modifier · ${current.campaign.name}` : null);

  if (id !== null && !current && (loading || !error)) {
    return <EditSkeleton slow={slow} onRetry={reload} />;
  }

  if (!current) {
    if (id === null || isCampaignNotFound(error)) return <EditNotFound />;
    return (
      <>
        <PageHeader
          title="Modifier la campagne"
          breadcrumbs={[
            { label: "Campagnes", href: routes.espace.campaigns() },
            { label: "Modifier" },
          ]}
        />
        <ErrorState
          error={error}
          onRetry={reload}
          backHref={routes.espace.campaigns()}
          backLabel="Mes campagnes"
        />
      </>
    );
  }

  const { campaign } = current;
  const detailHref = routes.espace.campaign(campaign.id);

  if (isDraft) {
    return (
      <>
        <EditSkeleton label="Ouverture de l'assistant…" />
        <p className="sr-only" role="status">
          Un brouillon se modifie dans l&apos;assistant : redirection en cours.
        </p>
      </>
    );
  }

  const meta = getCampaignStatusMeta(campaign, { audience: "annonceur" });
  const editable = isEditable(campaign.status);

  return (
    <>
      <PageHeader
        title="Modifier la campagne"
        breadcrumbs={[
          { label: "Campagnes", href: routes.espace.campaigns() },
          { label: campaign.name, href: detailHref },
          { label: "Modifier" },
        ]}
        meta={<StatusPill type="campaign" campaign={campaign} audience="annonceur" />}
        description={editable ? "Nom, objectif, budget, période et plage horaire." : campaign.name}
      />
      {editable ? (
        <EditForm key={campaign.id} data={current} />
      ) : (
        <EmptyState
          icon={<Lock />}
          title="Cette campagne n'est plus modifiable"
          description={`Statut : ${meta.label}. ${meta.description} Une campagne se modifie tant qu'elle est en brouillon ou à corriger ; pendant l'examen et après la décision, ses informations sont figées.`}
          action={
            <Button asChild variant="primary">
              <Link href={detailHref}>Retour à la campagne</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
