"use client";

import { FolderSearch, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { PagerBar, RoleRestricted } from "@/components/admin/admin-controls";
import {
  CampaignReviewDialog,
  type ReviewDecision,
  type ReviewNotice,
} from "@/components/admin/campaign-review-dialog";
import {
  activeFilterCount,
  advertiserName,
  AI_STATUS_FILTERS,
  BULK_INELIGIBLE_REASON,
  bulkEligibility,
  type BulkResult,
  bulkSummary,
  canDecide,
  DEFAULT_MODERATION_SORT,
  type ModerationFilterState,
  moderationSearchFilters,
  moderationSearchKey,
  moderationSortCaption,
  LEGACY_MODERATION_TABS,
  MODERATION_SORT_KEYS,
  MODERATION_SORT_OPTIONS,
  MODERATION_TAB_VALUES,
  MODERATION_TABS,
  moderationTabDef,
  reviewNeighbours,
  startCue,
  tabCountsFromDashboard,
  validateSequentially,
} from "@/components/admin/moderation-model";
import { useBreadcrumbs, useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useRegisterCommands } from "@/components/shell/command-palette";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApi, campaignsApi, statisticsApi, zonesApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import {
  CAMPAIGN_STATUSES,
  type CampaignResponse,
  type PageResponse,
  SUPPORT_TYPES,
} from "@/lib/api/types";
import {
  AI_REPORT_STATUS,
  CAMPAIGN_STATUS,
  CLIENT_VALIDATION_STATUS,
  SUPPORT_TYPE_LABEL,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTND,
  todayISO,
} from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const DESCRIPTION =
  "Chaque campagne est analysée par l'IA, puis validée ou refusée par un administrateur ZELQANE. Rien n'est diffusé sans cette décision.";

const URL_SCHEMA = {
  onglet: param.enum(MODERATION_TAB_VALUES, "a-traiter", LEGACY_MODERATION_TABS),
  q: param.string(),
  client: param.string(),
  zone: param.id(),
  statut: param.optionalEnum(CAMPAIGN_STATUSES),
  ia: param.optionalEnum(AI_STATUS_FILTERS),
  du: param.string(),
  au: param.string(),
  type: param.optionalEnum(SUPPORT_TYPES),
  tri: param.enum(MODERATION_SORT_KEYS, DEFAULT_MODERATION_SORT),
  page: param.id(),
  examen: param.id(),
};

export function ModerationView() {
  const { role, canAct } = useSession();

  if (role === "OPERATEUR") {
    return (
      <RoleRestricted
        header={
          <PageHeader
            title="Modération"
            description="Analyse IA puis décision humaine avant toute diffusion."
          />
        }
        title="File réservée aux administrateurs et superviseurs"
        description="Votre rôle d'opérateur donne accès à l'état des Porteurs, aux messages prioritaires et au journal des diffusions, pas aux dossiers des annonceurs."
      />
    );
  }

  return (
    <Suspense fallback={<QueueSkeleton />}>
      <ModerationQueue canAct={canAct} role={role} />
    </Suspense>
  );
}

function QueueSkeleton() {
  return (
    <LoadingRegion label="Chargement de la file de modération…" className="flex flex-col gap-4">
      <Skeleton className="h-12 w-full max-w-xl rounded-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </LoadingRegion>
  );
}

/** Debounced text filter mirrored in the URL (replace history). */
function useDebouncedUrlText(value: string, write: (v: string) => void, delay = 300) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const lastWritten = useRef(value);
  const writeRef = useRef(write);
  writeRef.current = write;
  if (value !== synced) {
    setSynced(value);
    if (value !== lastWritten.current) setText(value);
  }
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => {
      lastWritten.current = text;
      writeRef.current(text);
    }, delay);
    return () => clearTimeout(timer);
  }, [text, value, delay]);
  const reset = () => {
    lastWritten.current = "";
    setText("");
  };
  return [text, setText, reset] as const;
}

function ModerationQueue({
  canAct,
  role,
}: {
  canAct: boolean;
  role: ReturnType<typeof useSession>["role"];
}) {
  const router = useRouter();
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const tab = url.onglet;
  const tabDef = moderationTabDef(tab);
  const examenId = url.examen;

  const [query, setQuery, resetQuery] = useDebouncedUrlText(url.q, (q) =>
    setUrl({ q, page: null }),
  );
  const [client, setClient, resetClient] = useDebouncedUrlText(url.client, (c) =>
    setUrl({ client: c, page: null }),
  );

  const state: ModerationFilterState = {
    tab,
    q: url.q,
    client: url.client,
    zoneId: url.zone,
    status: url.statut,
    aiStatus: url.ia,
    from: url.du,
    to: url.au,
    supportType: url.type,
    sort: url.tri,
    page: url.page ?? 0,
  };
  const filters = moderationSearchFilters(state);
  const searchKey = moderationSearchKey(filters);
  const { data, error, loading, reload, setData } = useResource(
    `admin:moderation:${searchKey}`,
    (signal) => campaignsApi.search({ ...filters, signal }),
  );
  const dashboard = useResource("admin:dashboard", (signal) => statisticsApi.dashboard({ signal }));
  const zones = useResource("admin:zones", (signal) =>
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
  );
  const counts = dashboard.data ? tabCountsFromDashboard(dashboard.data) : null;

  const rows = useMemo(() => data?.items ?? [], [data]);
  // A deep link (?examen=) may target a campaign outside the current page.
  const inPage = examenId !== null ? (rows.find((c) => c.id === examenId) ?? null) : null;
  const outside = useResource(
    examenId !== null && data && !inPage ? `admin:campaign:${examenId}` : null,
    (signal) => campaignsApi.get(examenId as number, { signal }),
  );
  const selected = inPage ?? (outside.data?.id === examenId ? outside.data : null);
  const neighbours = examenId !== null ? reviewNeighbours(rows, examenId) : null;

  // Review overlay: pushed history entry; closing goes back when opened from this page.
  const openedHere = useRef(false);
  const [notice, setNotice] = useState<{ forId: number; notice: ReviewNotice } | null>(null);
  const today = todayISO();

  useBreadcrumbs(
    examenId !== null
      ? [
          {
            label: "Modération",
            href: routes.admin.moderation({ onglet: tab, q: url.q || undefined }),
          },
          { label: `Examen #${examenId}` },
        ]
      : null,
  );
  useDocumentTitle(examenId !== null ? `Examen #${examenId}` : null, "Modération");

  const openReview = (id: number) => {
    setNotice(null);
    openedHere.current = true;
    setUrl({ examen: id }, { history: "push" });
  };
  const goToReview = (id: number) => {
    setNotice(null);
    setUrl({ examen: id }, { history: "replace" });
  };
  const closeReview = () => {
    setNotice(null);
    if (openedHere.current) {
      openedHere.current = false;
      router.back();
    } else {
      setUrl({ examen: null }, { history: "replace" });
    }
  };

  const updateCampaign = (updated: CampaignResponse) => {
    setData((prev) => {
      const page: PageResponse<CampaignResponse> = prev ?? {
        items: [],
        page: 0,
        size: 20,
        totalItems: 0,
        totalPages: 0,
      };
      return { ...page, items: page.items.map((c) => (c.id === updated.id ? updated : c)) };
    });
    if (outside.data?.id === updated.id) outside.setData(updated);
    dashboard.reload();
  };

  const onDecided = (decision: ReviewDecision) => {
    if (decision.kind !== "validated") return;
    const nb = reviewNeighbours(rows, decision.campaign.id);
    const name = decision.campaign.name;
    if (nb.nextDecidable !== null) {
      setNotice({
        forId: nb.nextDecidable,
        notice: {
          tone: "success",
          title: `« ${name} » validée`,
          text: `Campagne suivante · ${nb.remaining} restante${nb.remaining > 1 ? "s" : ""} sur cette page.`,
        },
      });
      setUrl({ examen: nb.nextDecidable }, { history: "replace" });
    } else {
      setNotice({
        forId: decision.campaign.id,
        notice: {
          tone: "success",
          title: "Page traitée",
          text: `« ${name} » validée. Aucune autre campagne de cette page n'attend de décision.`,
        },
      });
    }
  };

  // ---- bulk validation (« À traiter », administrators) --------------------------------------
  const showBulk = canAct && tab === "a-traiter";
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const eligibleRows = showBulk ? rows.filter((c) => bulkEligibility(c) === "eligible") : [];
  const selectedRows = eligibleRows.filter((c) => selection.has(c.id));
  const toggle = (id: number, on: boolean) =>
    setSelection((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const runBulk = async () => {
    const targets = selectedRows.map((c) => c.id);
    setBulkResults(null);
    const results = await validateSequentially(
      targets,
      (id) => adminApi.validate(id, {}),
      (done, total) => setBulkProgress(`${done} sur ${total}`),
    );
    setBulkProgress(null);
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    for (const r of results) if (r.ok && r.campaign) updateCampaign(r.campaign);
    setSelection(new Set(targets.filter((id) => !okIds.has(id))));
    setBulkResults(results);
  };

  // ---- palette commands ------------------------------------------------------------------
  const firstDecidable = rows.find((c) => canDecide(c.status)) ?? null;
  useRegisterCommands(
    [
      ...(firstDecidable
        ? [
            {
              id: "moderation-next",
              label: `Examiner #${firstDecidable.id} ${firstDecidable.name}`,
              group: "Cette page",
              keywords: ["examiner", "file", "suivante"],
              run: () => openReview(firstDecidable.id),
            },
          ]
        : []),
      ...MODERATION_TABS.filter((t) => t.value !== tab).map((t) => ({
        id: `moderation-tab-${t.value}`,
        label: `Afficher l'onglet « ${t.label} »`,
        group: "Cette page",
        keywords: ["onglet", "filtre"],
        run: () => setUrl({ onglet: t.value, examen: null, page: null }),
      })),
    ],
    [firstDecidable?.id, tab],
  );

  const columns: DataTableColumn<CampaignResponse>[] = [
    ...(showBulk
      ? [
          {
            key: "select",
            header: <span className="sr-only">Sélection</span>,
            hideOnMobile: true,
            className: "w-12",
            cell: (c: CampaignResponse) => {
              const e = bulkEligibility(c);
              const reason = e === "eligible" ? null : BULK_INELIGIBLE_REASON[e];
              return (
                <span title={reason ?? undefined}>
                  <Checkbox
                    className="-my-2"
                    checked={selection.has(c.id)}
                    disabled={e !== "eligible"}
                    onChange={(ev) => toggle(c.id, ev.target.checked)}
                    label={
                      <span className="sr-only">
                        Sélectionner « {c.name} »{reason ? ` — ${reason}` : ""}
                      </span>
                    }
                  />
                </span>
              );
            },
          },
        ]
      : []),
    {
      key: "name",
      header: "Campagne",
      primary: true,
      className: "min-w-[14rem]",
      cell: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IdChip id={c.id} />
            <Link
              href={routes.admin.moderation({ onglet: tab, q: url.q || undefined, examen: c.id })}
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                openReview(c.id);
              }}
              className="font-label font-semibold text-ink-strong hover:text-brand-blue-text hover:underline max-md:line-clamp-2 max-md:break-words md:truncate"
              title={c.name}
            >
              {c.name}
            </Link>
          </div>
          {c.objective ? (
            <p className="mt-1 line-clamp-1 max-w-[28rem] text-[0.8125rem] text-muted">
              {c.objective}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "client",
      header: "Annonceur",
      cell: (c) => (
        <div className="flex flex-col items-start gap-1">
          <span className="whitespace-nowrap">{advertiserName(c)}</span>
          {c.clientValidationStatus && c.clientValidationStatus !== "VALIDATED" ? (
            <Badge tone={CLIENT_VALIDATION_STATUS[c.clientValidationStatus].tone} size="sm">
              {CLIENT_VALIDATION_STATUS[c.clientValidationStatus].label}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "debut",
      header: "Période",
      cell: (c) => {
        const cue = startCue(c.startDate, today);
        return (
          <div className="whitespace-nowrap">
            <p className="whitespace-nowrap tabular">
              {c.startDate ? formatDate(c.startDate, "medium") : "—"}
            </p>
            {cue.days !== null && canDecide(c.status) ? (
              <p
                className={cx(
                  "text-[0.8125rem] whitespace-nowrap",
                  cue.tone === "danger"
                    ? "text-danger"
                    : cue.tone === "warning"
                      ? "text-warning"
                      : "text-muted",
                )}
              >
                {cue.label}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Statut",
      mobileMeta: true,
      cell: (c) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill type="campaign" campaign={c} audience="staff" size="sm" />
          {c.aiRiskScore != null ? (
            <span className="text-xs whitespace-nowrap text-muted tabular">
              Risque {formatNumber(c.aiRiskScore)} · qualité {formatNumber(c.aiQualityScore ?? 0)}
            </span>
          ) : null}
          {c.aiOverride ? (
            <span className="text-xs text-warning">Dérogation à l&apos;IA</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "reservations",
      header: "Réservations",
      align: "right",
      cell: (c) => (
        <span className="whitespace-nowrap tabular">
          {formatNumber(c.reservationsCount ?? 0)}
          {c.estimatedCost ? (
            <span className="block text-xs text-muted">{formatTND(c.estimatedCost)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "attente",
      header: "Soumise",
      cell: (c) =>
        c.submittedAt ? (
          <span className="whitespace-nowrap" title={formatDateTime(c.submittedAt)}>
            {capitalize(formatRelative(c.submittedAt))}
          </span>
        ) : (
          <span className="text-muted">Non soumise</span>
        ),
    },
  ];

  const filterCount = activeFilterCount(state);
  const filtered = filterCount > 0 || url.q.trim().length > 0;
  const total = data?.totalItems ?? 0;
  const resultLabel = `${formatNumber(total)} campagne${total > 1 ? "s" : ""}`;
  const bulkFailures = bulkResults?.filter((r) => !r.ok) ?? [];

  const resetFilters = () => {
    resetQuery();
    resetClient();
    setUrl({
      q: "",
      client: "",
      zone: null,
      statut: null,
      ia: null,
      du: "",
      au: "",
      type: null,
      tri: DEFAULT_MODERATION_SORT,
      page: null,
    });
  };

  return (
    <>
      <PageHeader
        title="Modération"
        description={DESCRIPTION}
        secondaryActions={
          <Button
            variant="secondary"
            onClick={() => {
              reload();
              dashboard.reload();
            }}
            loading={loading && data !== undefined}
            loadingLabel="Actualisation…"
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Actualiser
          </Button>
        }
      />

      {!canAct ? (
        <ReadOnlyNotice role={role} className="mb-6">
          Vous consultez les dossiers et les rapports IA ; la validation et le refus sont réservés
          aux administrateurs.
        </ReadOnlyNotice>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = MODERATION_TAB_VALUES.find((t) => t === v);
          if (!next) return;
          setSelection(new Set());
          setBulkResults(null);
          setUrl({ onglet: next, page: null, statut: next === "toutes" ? url.statut : null });
        }}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Filtrer la file de modération" className="self-start">
          {MODERATION_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} count={counts?.[t.value]}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-0 flex flex-col gap-4">
          <FilterBar
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Nom de la campagne",
              label: "Rechercher une campagne",
            }}
            sort={{
              value: url.tri,
              options: MODERATION_SORT_OPTIONS,
              onChange: (v) => {
                const next = MODERATION_SORT_KEYS.find((k) => k === v);
                if (next) setUrl({ tri: next, page: null });
              },
            }}
            resultCount={data ? resultLabel : undefined}
            activeCount={filterCount}
            onReset={resetFilters}
          >
            <Field label="Annonceur" className="w-48">
              <Input
                value={client}
                placeholder="Société, nom ou e-mail"
                onChange={(e) => setClient(e.target.value)}
              />
            </Field>
            <Field label="Zone" className="w-44">
              <Select
                value={url.zone !== null ? String(url.zone) : ""}
                onChange={(e) =>
                  setUrl({ zone: e.target.value ? Number(e.target.value) : null, page: null })
                }
              >
                <option value="">Toutes les zones</option>
                {(zones.data ?? []).map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            {tab === "toutes" ? (
              <Field label="Statut" className="w-48">
                <Select
                  value={url.statut ?? ""}
                  onChange={(e) =>
                    setUrl({
                      statut: CAMPAIGN_STATUSES.find((s) => s === e.target.value) ?? null,
                      page: null,
                    })
                  }
                >
                  <option value="">Tous les statuts</option>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CAMPAIGN_STATUS[s].label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Avis IA" className="w-44">
              <Select
                value={url.ia ?? ""}
                onChange={(e) =>
                  setUrl({
                    ia: AI_STATUS_FILTERS.find((s) => s === e.target.value) ?? null,
                    page: null,
                  })
                }
              >
                <option value="">Tous les avis</option>
                {AI_STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {AI_REPORT_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type de Porteur" className="w-44">
              <Select
                value={url.type ?? ""}
                onChange={(e) =>
                  setUrl({
                    type: SUPPORT_TYPES.find((t) => t === e.target.value) ?? null,
                    page: null,
                  })
                }
              >
                <option value="">Tous les types</option>
                {SUPPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SUPPORT_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Diffusion du" className="w-40">
              <Input
                type="date"
                value={url.du}
                max={url.au || undefined}
                onChange={(e) => setUrl({ du: e.target.value, page: null })}
              />
            </Field>
            <Field label="au" className="w-40">
              <Input
                type="date"
                value={url.au}
                min={url.du || undefined}
                onChange={(e) => setUrl({ au: e.target.value, page: null })}
              />
            </Field>
          </FilterBar>

          {examenId !== null && data && !inPage && outside.error ? (
            <Alert
              tone="warning"
              title={`Campagne #${examenId} introuvable`}
              action={
                <Button size="sm" variant="secondary" onClick={() => setUrl({ examen: null })}>
                  Revenir à la file
                </Button>
              }
            >
              Ce lien ne correspond à aucune campagne de la plateforme. Elle a peut-être été
              supprimée par l&apos;annonceur.
            </Alert>
          ) : null}

          {showBulk && data ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
                <p className="text-sm text-ink-soft" aria-live="polite">
                  {selectedRows.length > 0
                    ? `${selectedRows.length} sélectionnée${selectedRows.length > 1 ? "s" : ""}`
                    : `Validation groupée : ${eligibleRows.length} campagne${eligibleRows.length > 1 ? "s" : ""} à avis IA favorable avec au moins une réservation.`}
                </p>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {eligibleRows.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelection(
                          selectedRows.length === eligibleRows.length
                            ? new Set()
                            : new Set(eligibleRows.map((c) => c.id)),
                        )
                      }
                    >
                      {selectedRows.length === eligibleRows.length
                        ? "Tout désélectionner"
                        : "Tout sélectionner"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="primary"
                    iconLeft={<ShieldCheck aria-hidden="true" />}
                    disabledReason={
                      selectedRows.length === 0
                        ? "Cochez au moins une campagne à avis IA favorable avec une réservation."
                        : null
                    }
                    onClick={() => setBulkConfirmOpen(true)}
                  >
                    Valider la sélection ({selectedRows.length})
                  </Button>
                </div>
              </div>
              {bulkProgress ? (
                <p className="text-[0.8125rem] text-muted" role="status">
                  Validation en cours : {bulkProgress}
                </p>
              ) : null}
              {bulkResults ? (
                <Alert
                  tone={bulkFailures.length > 0 ? "warning" : "success"}
                  title={bulkSummary(bulkResults)}
                >
                  {bulkFailures.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {bulkFailures.map((r) => (
                        <li key={r.id}>
                          #{r.id} — {presentError(r.error).message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Les réservations temporaires des campagnes validées sont confirmées."
                  )}
                </Alert>
              ) : null}
            </div>
          ) : null}

          {data ? (
            <>
              <p className="text-[0.8125rem] text-muted">
                Trié par : {moderationSortCaption(url.tri)}
              </p>
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={(c) => c.id}
                caption={`Campagnes — ${tabDef.label}`}
                rowActions={(c) => {
                  const decide = canAct && canDecide(c.status);
                  return (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openReview(c.id)}
                      aria-label={`${decide ? "Examiner" : "Consulter"} la campagne ${c.name}`}
                    >
                      {decide ? "Examiner" : "Consulter"}
                    </Button>
                  );
                }}
                emptyFiltered={
                  filtered ? (
                    <EmptyState
                      compact
                      icon={<FolderSearch />}
                      title="Aucun résultat pour ces filtres"
                      description="Aucune campagne ne correspond à cette recherche dans cet onglet."
                      action={
                        <Button variant="secondary" onClick={resetFilters}>
                          Réinitialiser les filtres
                        </Button>
                      }
                    />
                  ) : undefined
                }
                empty={
                  <EmptyState
                    icon={<ShieldCheck />}
                    title={tab === "a-traiter" ? "File à jour" : "Rien à afficher"}
                    description={tabDef.empty}
                    action={
                      tab !== "toutes" ? (
                        <Button
                          variant="secondary"
                          onClick={() => setUrl({ onglet: "toutes", page: null })}
                        >
                          Voir toutes les campagnes
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
              <PagerBar
                page={data}
                noun="campagnes"
                onPage={(p) => setUrl({ page: p > 0 ? p : null })}
              />
            </>
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <QueueSkeleton />
          )}
        </TabsContent>
      </Tabs>

      <CampaignReviewDialog
        campaign={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        canAct={canAct}
        onCampaignChange={updateCampaign}
        onDecided={onDecided}
        notice={notice && notice.forId === examenId ? notice.notice : null}
        navigation={
          neighbours && selected
            ? {
                index: neighbours.index,
                total: neighbours.total,
                listLabel: tabDef.label,
                remaining: neighbours.remaining,
                onPrevious:
                  neighbours.previous !== null
                    ? () => goToReview(neighbours.previous as number)
                    : null,
                onNext:
                  neighbours.next !== null ? () => goToReview(neighbours.next as number) : null,
                onNextDecidable:
                  neighbours.nextDecidable !== null
                    ? () => goToReview(neighbours.nextDecidable as number)
                    : null,
              }
            : null
        }
      />

      {showBulk ? (
        <ConfirmDialog
          open={bulkConfirmOpen}
          onOpenChange={setBulkConfirmOpen}
          tone="primary"
          title={`Valider ${selectedRows.length} campagne${selectedRows.length > 1 ? "s" : ""} ?`}
          description="Chaque campagne est programmée (ou mise en diffusion si sa période a commencé) et ses réservations temporaires sont confirmées."
          confirmLabel={`Valider ${selectedRows.length} campagne${selectedRows.length > 1 ? "s" : ""}`}
          confirmDisabled={selectedRows.length === 0}
          onConfirm={runBulk}
        >
          <ul
            aria-label="Campagnes à valider"
            className="flex max-h-60 flex-col divide-y divide-line overflow-y-auto rounded-card border border-line"
          >
            {selectedRows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <IdChip id={c.id} />
                <span className="min-w-0 flex-1 truncate text-ink-strong" title={c.name}>
                  {c.name}
                </span>
                <span className="text-[0.8125rem] whitespace-nowrap text-muted">
                  {advertiserName(c)}
                </span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
