"use client";

import { FolderSearch, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  CampaignReviewDialog,
  type ReviewDecision,
  type ReviewNotice,
} from "@/components/admin/campaign-review-dialog";
import {
  advertiserLabel,
  BULK_INELIGIBLE_REASON,
  type BulkEligibility,
  bulkEligibility,
  type BulkResult,
  bulkSummary,
  canDecide,
  countByTab,
  DEFAULT_MODERATION_SORT,
  filterCampaigns,
  LEGACY_MODERATION_TABS,
  MODERATION_SORT_KEYS,
  MODERATION_SORT_OPTIONS,
  MODERATION_TAB_VALUES,
  MODERATION_TABS,
  moderationSortCaption,
  moderationTabDef,
  reviewNeighbours,
  startCue,
  validateSequentially,
  validationWillNotAir,
} from "@/components/admin/moderation-model";
import { useBreadcrumbs, useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useRegisterCommands } from "@/components/shell/command-palette";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApi, campaignsApi, reservationsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDate, formatDateTime, formatRelative, todayISO } from "@/lib/format";
import { runWithConcurrency } from "@/lib/network/use-supports-availability";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, useTableSort, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const DESCRIPTION =
  "Chaque campagne est analysée par l'IA, puis validée ou refusée par un administrateur TPUB. Rien n'est diffusé sans cette décision.";

const URL_SCHEMA = {
  onglet: param.enum(MODERATION_TAB_VALUES, "a-traiter", LEGACY_MODERATION_TABS),
  q: param.string(),
  examen: param.id(),
};

export function ModerationView() {
  const { role, canAct } = useSession();

  if (role === "OPERATEUR") {
    return (
      <>
        <PageHeader
          title="Modération"
          description="Analyse IA puis décision humaine avant toute diffusion."
        />
        <EmptyState
          icon={<ShieldOff />}
          title="File réservée aux administrateurs et superviseurs"
          description="Votre rôle d'opérateur donne accès à l'état des Porteurs et aux messages prioritaires, pas aux dossiers des annonceurs."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.admin.network()}>Voir le réseau</Link>
            </Button>
          }
        />
      </>
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

type ReservationsState =
  { state: "loading" | "error" } | { state: "ready"; list: readonly ReservationResponse[] };

/** Reservations of the campaigns eligible for bulk validation (shared cache, 4 in parallel). */
function useQueueReservations(ids: readonly number[], enabled: boolean) {
  const key = enabled ? [...ids].sort((a, b) => a - b).join(",") : "";
  const [byId, setById] = useState<ReadonlyMap<number, ReservationsState>>(new Map());

  useEffect(() => {
    if (!key) return;
    const list = key.split(",").map(Number);
    const controller = new AbortController();
    void runWithConcurrency(
      list,
      4,
      async (id) => {
        try {
          const reservations = await fetchCached(
            resourceKeys.reservationsByCampaign(id),
            (s) => reservationsApi.byCampaign(id, { signal: s }),
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            setById((m) => new Map(m).set(id, { state: "ready", list: reservations }));
          }
        } catch {
          if (!controller.signal.aborted) {
            setById((m) => new Map(m).set(id, { state: "error" }));
          }
        }
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [key]);

  return byId;
}

function ModerationQueue({
  canAct,
  role,
}: {
  canAct: boolean;
  role: ReturnType<typeof useSession>["role"];
}) {
  const router = useRouter();
  const { data, error, loading, reload, setData } = useResource(
    "admin:campaigns",
    (signal) => campaignsApi.all({ signal }),
    { cacheKey: resourceKeys.campaignsAll },
  );
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const { sort: sortState, setSort } = useTableSort("tri", {
    defaultSort: DEFAULT_MODERATION_SORT,
    allowedKeys: MODERATION_SORT_KEYS,
  });
  const sort = sortState ?? DEFAULT_MODERATION_SORT;
  const tab = url.onglet;
  const tabDef = moderationTabDef(tab);
  const examenId = url.examen;

  // Search: local input (instant filtering), URL written with replace after a short pause.
  const [query, setQuery] = useState(url.q);
  const [syncedQ, setSyncedQ] = useState(url.q);
  const lastWrittenQ = useRef(url.q);
  if (url.q !== syncedQ) {
    setSyncedQ(url.q);
    if (url.q !== lastWrittenQ.current) setQuery(url.q);
  }
  useEffect(() => {
    if (query === url.q) return;
    const timer = setTimeout(() => {
      lastWrittenQ.current = query;
      setUrl({ q: query });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, url.q, setUrl]);

  // Review overlay: pushed history entry; closing goes back when opened from this page.
  const openedHere = useRef(false);
  const [notice, setNotice] = useState<{ forId: number; notice: ReviewNotice } | null>(null);

  const today = todayISO();
  const counts = useMemo(() => countByTab(data ?? []), [data]);
  const rows = useMemo(
    () => filterCampaigns(data ?? [], tab, query, sort, examenId),
    [data, tab, query, sort, examenId],
  );
  const selected = examenId !== null ? (data?.find((c) => c.id === examenId) ?? null) : null;
  const neighbours = examenId !== null ? reviewNeighbours(rows, examenId) : null;

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

  const updateCampaign = (updated: CampaignResponse) =>
    setData((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)));

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
          text: `Campagne suivante · ${nb.remaining} restante${nb.remaining > 1 ? "s" : ""} dans « ${tabDef.label} ».`,
        },
      });
      setUrl({ examen: nb.nextDecidable }, { history: "replace" });
    } else {
      setNotice({
        forId: decision.campaign.id,
        notice: {
          tone: "success",
          title: "File traitée",
          text: `« ${name} » validée. Aucune autre campagne n'attend de décision dans « ${tabDef.label} ».`,
        },
      });
    }
  };

  // ---- bulk validation (« À traiter », administrators) --------------------------------------
  const showBulk = canAct && tab === "a-traiter";
  const approvedIds = useMemo(
    () =>
      (data ?? [])
        .filter((c) => c.status === "APPROVED_BY_AI" && c.aiStatus === "APPROVED")
        .map((c) => c.id),
    [data],
  );
  const reservationsById = useQueueReservations(approvedIds, showBulk);
  const eligibility = (c: CampaignResponse): BulkEligibility =>
    bulkEligibility(c, reservationsById.get(c.id));
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[] | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  const eligibleRows = showBulk ? rows.filter((c) => eligibility(c) === "eligible") : [];
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
      (id) => adminApi.validate(id),
      (done, total) => setBulkProgress(`${done} sur ${total}`),
    );
    setBulkProgress(null);
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
    setData((prev) =>
      (prev ?? []).map((c) => results.find((r) => r.id === c.id && r.ok)?.campaign ?? c),
    );
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
        run: () => setUrl({ onglet: t.value, examen: null }),
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
              const e = eligibility(c);
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
              // Mobile cards share the title line with the status pill: two lines, not « Soldes d'autom… ».
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
      cell: (c) => <span className="whitespace-nowrap">{advertiserLabel(c.clientId)}</span>,
    },
    {
      key: "debut",
      header: "Début",
      sortable: true,
      sortLabel: "date de début",
      cell: (c) => {
        const cue = startCue(c.startDate, today);
        return (
          <div className="whitespace-nowrap">
            <p className="whitespace-nowrap tabular">
              {c.startDate ? formatDate(c.startDate, "medium") : "—"}
            </p>
            {cue.days !== null ? (
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
      header: tab === "a-traiter" || tab === "revue" ? "Avis IA" : "Statut",
      mobileMeta: true,
      cell: (c) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill type="campaign" campaign={c} audience="staff" size="sm" />
          {validationWillNotAir(c) ? (
            <span className="text-xs text-warning">Ne sera pas diffusée si validée</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "attente",
      header: "Soumise",
      sortable: true,
      sortLabel: "date de soumission",
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

  const filtered = query.trim().length > 0;
  const resultLabel = `${rows.length} campagne${rows.length > 1 ? "s" : ""}`;
  const bulkFailures = bulkResults?.filter((r) => !r.ok) ?? [];

  return (
    <>
      <PageHeader
        title="Modération"
        description={DESCRIPTION}
        secondaryActions={
          <Button
            variant="secondary"
            onClick={reload}
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

      {data ? (
        <Tabs
          value={tab}
          onValueChange={(v) => {
            const next = MODERATION_TAB_VALUES.find((t) => t === v);
            if (!next) return;
            setSelection(new Set());
            setBulkResults(null);
            setUrl({ onglet: next });
          }}
          className="flex flex-col gap-5"
        >
          <TabsList aria-label="Filtrer la file de modération" className="self-start">
            {MODERATION_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} count={counts[t.value]}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-0 flex flex-col gap-4">
            <FilterBar
              search={{
                value: query,
                onChange: setQuery,
                placeholder: "Nom, objectif ou n° de campagne",
                label: "Rechercher une campagne",
              }}
              sort={{
                value: sort.key,
                options: MODERATION_SORT_OPTIONS,
                onChange: (v) => setSort({ key: v, dir: "asc" }),
              }}
              resultCount={resultLabel}
              activeCount={
                sort.key !== DEFAULT_MODERATION_SORT.key || sort.dir !== DEFAULT_MODERATION_SORT.dir
                  ? 1
                  : 0
              }
              onReset={() => {
                setQuery("");
                lastWrittenQ.current = "";
                setUrl({ q: "" });
                setSort(null);
              }}
            />

            {examenId !== null && data && !selected ? (
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

            {showBulk ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
                  <p className="text-sm text-ink-soft" aria-live="polite">
                    {selectedRows.length > 0
                      ? `${selectedRows.length} sélectionnée${selectedRows.length > 1 ? "s" : ""}`
                      : `Validation groupée : ${eligibleRows.length} campagne${eligibleRows.length > 1 ? "s" : ""} à avis IA favorable avec au moins un créneau actif.`}
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
                          ? "Cochez au moins une campagne à avis IA favorable avec un créneau actif."
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
                    action={
                      bulkFailures.length > 0 ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setBulkConfirmOpen(true)}
                        >
                          Réessayer
                        </Button>
                      ) : undefined
                    }
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
                      "Les créneaux temporaires des campagnes validées sont confirmés."
                    )}
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(c) => c.id}
              caption={`Campagnes — ${tabDef.label}`}
              sort={sort}
              onSortChange={setSort}
              manualSort
              sortCaption={moderationSortCaption(sort)}
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
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery("");
                          lastWrittenQ.current = "";
                          setUrl({ q: "" });
                        }}
                      >
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
                      <Button variant="secondary" onClick={() => setUrl({ onglet: "toutes" })}>
                        Voir toutes les campagnes
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </TabsContent>
        </Tabs>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <QueueSkeleton />
      )}

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
          description="Chaque campagne passe au statut « active » et ses créneaux temporaires sont confirmés : la diffusion devient possible sur sa période. Décision définitive, sans retour en arrière depuis le back-office."
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
                  {advertiserLabel(c.clientId)}
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
