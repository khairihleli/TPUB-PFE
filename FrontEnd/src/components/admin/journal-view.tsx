"use client";

import { FileClock, MonitorPlay, RefreshCw, ScanSearch, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PagerBar } from "@/components/admin/admin-controls";
import { IdChip } from "@/components/admin/admin-ui";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditQuery,
  DECISION_TYPES,
  DECISION_VALUES,
  type DecisionFlag,
  decisionFlags,
  decisionsQuery,
  DIFFUSION_CONTENT_TYPES,
  diffusionsQuery,
  type JournalFilterState,
  journalFilterCount,
  type JournalTab,
  journalTabsFor,
  JOURNAL_TABS,
  prettyDetails,
} from "@/components/admin/journal-model";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiApi, auditApi, diffusionApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import type {
  AiDecisionLogResponse,
  AuditLogResponse,
  DiffusionLogResponse,
} from "@/lib/api/types";
import {
  aiDecisionMeta,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  auditActionLabel,
  auditEntityLabel,
  DIFFUSION_CONTENT_TYPE_LABEL,
  ROLE_LABEL,
} from "@/lib/campaign-status";
import { formatDateTime, formatNumber, formatTND } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const URL_SCHEMA = {
  onglet: param.enum(JOURNAL_TABS, "audit"),
  action: param.optionalEnum(AUDIT_ACTIONS),
  entite: param.optionalEnum(AUDIT_ENTITIES),
  objet: param.string(),
  acteur: param.id(),
  type: param.optionalEnum(DECISION_TYPES),
  decision: param.optionalEnum(DECISION_VALUES),
  campagne: param.id(),
  porteur: param.id(),
  zone: param.id(),
  contenu: param.optionalEnum(DIFFUSION_CONTENT_TYPES),
  du: param.string(),
  au: param.string(),
  page: param.id(),
};

const CLEARED_FILTERS = {
  action: null,
  entite: null,
  objet: "",
  acteur: null,
  type: null,
  decision: null,
  campagne: null,
  porteur: null,
  zone: null,
  contenu: null,
  du: "",
  au: "",
  page: null,
} as const;

const TAB_LABEL: Record<JournalTab, string> = {
  audit: "Audit",
  "decisions-ia": "Décisions IA",
  diffusions: "Diffusions",
};

export function JournalView() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <JournalContent />
    </Suspense>
  );
}

async function loadNetwork(signal: AbortSignal) {
  const [zones, supports] = await Promise.all([
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
  ]);
  return { zones, supports };
}

function JournalContent() {
  const { role } = useSession();
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const allowed = journalTabsFor(role);
  const tab: JournalTab = allowed.includes(url.onglet) ? url.onglet : (allowed[0] ?? "diffusions");

  const state: JournalFilterState = {
    action: url.action,
    entity: url.entite,
    entityId: url.objet,
    actorId: url.acteur,
    decisionType: url.type,
    decision: url.decision,
    campaignId: url.campagne,
    supportId: url.porteur,
    zoneId: url.zone,
    contentType: url.contenu,
    from: url.du,
    to: url.au,
    page: url.page ?? 0,
  };

  const audit = useResource(
    tab === "audit" ? `admin:journal:audit:${JSON.stringify(auditQuery(state))}` : null,
    (signal) => auditApi.list({ ...auditQuery(state), signal }),
  );
  const decisions = useResource(
    tab === "decisions-ia"
      ? `admin:journal:decisions:${JSON.stringify(decisionsQuery(state))}`
      : null,
    (signal) => aiApi.decisions({ ...decisionsQuery(state), signal }),
  );
  const diffusions = useResource(
    tab === "diffusions"
      ? `admin:journal:diffusions:${JSON.stringify(diffusionsQuery(state))}`
      : null,
    (signal) => diffusionApi.logs({ ...diffusionsQuery(state), signal }),
  );
  const network = useResource(tab === "diffusions" ? "admin:journal:network" : null, loadNetwork);

  const current = tab === "audit" ? audit : tab === "decisions-ia" ? decisions : diffusions;
  const resetFilters = () => setUrl(CLEARED_FILTERS);
  const onPage = (p: number) => setUrl({ page: p > 0 ? p : null });

  const dateFields = (
    <>
      <Field label="Du" className="w-40">
        <Input
          type="date"
          value={url.du}
          max={url.au || undefined}
          onChange={(e) => setUrl({ du: e.target.value, page: null })}
        />
      </Field>
      <Field label="Au" className="w-40">
        <Input
          type="date"
          value={url.au}
          min={url.du || undefined}
          onChange={(e) => setUrl({ au: e.target.value, page: null })}
        />
      </Field>
    </>
  );
  const campaignField = (
    <Field label="N° de campagne" className="w-36">
      <Input
        inputMode="numeric"
        value={url.campagne !== null ? String(url.campagne) : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          setUrl({ campagne: Number.isInteger(n) && n > 0 ? n : null, page: null });
        }}
      />
    </Field>
  );

  const auditColumns: DataTableColumn<AuditLogResponse>[] = [
    {
      key: "when",
      header: "Date",
      cell: (a) => (
        <span className="text-[0.8125rem] whitespace-nowrap tabular">
          {formatDateTime(a.createdAt)}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      primary: true,
      cell: (a) => (
        <div className="min-w-0">
          <p className="font-label font-semibold text-ink-strong">{auditActionLabel(a.action)}</p>
          <p className="text-[0.8125rem] text-ink-soft">{a.summary}</p>
          {prettyDetails(a.details) ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[0.75rem] text-brand-blue-text">
                Détails
              </summary>
              <pre className="mt-1 max-h-48 max-w-[32rem] overflow-auto rounded-control border border-line bg-overlay-inset p-2 font-mono text-[0.75rem] whitespace-pre-wrap text-ink-soft">
                {prettyDetails(a.details)}
              </pre>
            </details>
          ) : null}
        </div>
      ),
    },
    {
      key: "entity",
      header: "Objet",
      cell: (a) => (
        <span className="whitespace-nowrap">
          {auditEntityLabel(a.entityType)}
          {a.entityId ? <span className="text-muted"> #{a.entityId}</span> : null}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Auteur",
      mobileMeta: true,
      cell: (a) => (
        <span className="text-[0.8125rem]">
          {a.actorName ?? a.actorEmail ?? "Système"}
          {a.actorRole ? <span className="block text-muted">{ROLE_LABEL[a.actorRole]}</span> : null}
        </span>
      ),
    },
    {
      key: "ip",
      header: "Adresse IP",
      hideOnMobile: true,
      cell: (a) => (
        <span className="font-mono text-[0.75rem] text-muted">{a.ipAddress ?? "—"}</span>
      ),
    },
  ];

  const flags = decisions.data
    ? decisionFlags(decisions.data.items)
    : new Map<number, DecisionFlag[]>();
  const decisionColumns: DataTableColumn<AiDecisionLogResponse>[] = [
    {
      key: "when",
      header: "Date",
      cell: (d) => (
        <span className="text-[0.8125rem] whitespace-nowrap tabular">
          {formatDateTime(d.createdAt)}
        </span>
      ),
    },
    {
      key: "campaign",
      header: "Campagne",
      primary: true,
      cell: (d) => (
        <span className="inline-flex items-center gap-2">
          <IdChip id={d.campaignId} />
          <Link
            href={routes.admin.moderation({ onglet: "toutes", examen: d.campaignId })}
            className="font-label font-semibold text-ink-strong hover:text-brand-blue-text hover:underline"
          >
            {d.campaignName}
          </Link>
        </span>
      ),
    },
    {
      key: "decision",
      header: "Décision",
      mobileMeta: true,
      cell: (d) => {
        const meta = aiDecisionMeta(d.decisionType, d.decision);
        const rowFlags = flags.get(d.id) ?? [];
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone} size="sm" title={meta.description}>
              {meta.label}
            </Badge>
            {d.preview ? (
              <Badge tone="muted" size="sm">
                Pré-analyse
              </Badge>
            ) : null}
            {rowFlags.includes("override") ? (
              <Badge tone="warning" size="sm">
                Dérogation
              </Badge>
            ) : null}
            {rowFlags.includes("disagreement") ? (
              <Badge tone="danger" size="sm" title="Décision contraire à l'avis de l'IA">
                Désaccord IA / admin
              </Badge>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "scores",
      header: "Risque · qualité",
      align: "right",
      cell: (d) => (
        <span className="whitespace-nowrap tabular">
          {formatNumber(d.riskScore)} · {formatNumber(d.qualityScore)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Motif",
      cell: (d) => (
        <span className="text-[0.8125rem] text-ink-soft">
          {d.reason ?? "—"}
          <span className="block text-muted">
            {d.decisionType === "AI" ? "IA" : (d.decidedByName ?? "Administrateur")}
          </span>
        </span>
      ),
    },
  ];

  const diffusionColumns: DataTableColumn<DiffusionLogResponse>[] = [
    {
      key: "when",
      header: "Diffusé le",
      cell: (l) => (
        <span className="text-[0.8125rem] whitespace-nowrap tabular">
          {formatDateTime(l.diffusedAt)}
        </span>
      ),
    },
    {
      key: "support",
      header: "Porteur",
      primary: true,
      cell: (l) => (
        <span>
          <span className="font-label font-semibold text-ink-strong">{l.supportName}</span>
          <span className="block text-[0.8125rem] text-muted">{l.zoneName ?? "—"}</span>
        </span>
      ),
    },
    {
      key: "type",
      header: "Contenu",
      mobileMeta: true,
      cell: (l) => (
        <Badge
          tone={
            l.contentType === "URGENCE"
              ? "danger"
              : l.contentType === "PUBLICITE"
                ? "brand"
                : "neutral"
          }
          size="sm"
        >
          {DIFFUSION_CONTENT_TYPE_LABEL[l.contentType]}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Titre",
      cell: (l) =>
        l.campaignId !== null ? (
          <Link
            href={routes.admin.moderation({ onglet: "toutes", examen: l.campaignId })}
            className="text-brand-blue-text hover:underline"
          >
            {l.campaignName ?? l.title ?? `Campagne n° ${l.campaignId}`}
          </Link>
        ) : (
          <span className="text-ink-soft">{l.title ?? "—"}</span>
        ),
    },
    {
      key: "duration",
      header: "Durée",
      align: "right",
      cell: (l) => (
        <span className="tabular">
          {l.durationSeconds !== null ? `${l.durationSeconds} s` : "—"}
        </span>
      ),
    },
    {
      key: "clicks",
      header: "Clics · interactions",
      align: "right",
      cell: (l) => (
        <span className="tabular">
          {formatNumber(l.clicks)} · {formatNumber(l.interactions)}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Coût",
      align: "right",
      cell: (l) => <span className="tabular">{formatTND(l.cost)}</span>,
    },
  ];

  const empty = (
    <EmptyState
      icon={<FileClock />}
      title="Journal vide"
      description="Aucune ligne enregistrée pour le moment."
    />
  );
  const emptyFiltered =
    journalFilterCount(tab, state) > 0 ? (
      <EmptyState
        compact
        icon={<Search />}
        title="Aucune ligne pour ces filtres"
        action={
          <Button variant="secondary" onClick={resetFilters}>
            Réinitialiser les filtres
          </Button>
        }
      />
    ) : undefined;
  const loadingState = (
    <LoadingRegion label="Chargement du journal…" className="flex flex-col gap-3">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </LoadingRegion>
  );
  const count = current.data
    ? `${formatNumber(current.data.totalItems)} ligne${current.data.totalItems > 1 ? "s" : ""}`
    : undefined;

  return (
    <>
      <PageHeader
        title="Journal"
        description="Traçabilité des actions sensibles, des décisions IA et administrateur, et de chaque diffusion sur les Porteurs."
        secondaryActions={
          <Button
            variant="secondary"
            iconLeft={<RefreshCw aria-hidden="true" />}
            loading={current.loading && current.data !== undefined}
            loadingLabel="Actualisation…"
            onClick={current.reload}
          >
            Actualiser
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = allowed.find((t) => t === v);
          if (next) {
            setUrl({ ...CLEARED_FILTERS, onglet: next, campagne: url.campagne });
          }
        }}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Journaux" className="self-start">
          {allowed.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              icon={
                t === "audit" ? (
                  <ShieldCheck />
                ) : t === "decisions-ia" ? (
                  <ScanSearch />
                ) : (
                  <MonitorPlay />
                )
              }
            >
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        {allowed.includes("audit") ? (
          <TabsContent value="audit" className="mt-0 flex flex-col gap-4">
            <FilterBar
              resultCount={count}
              activeCount={journalFilterCount("audit", state)}
              onReset={resetFilters}
            >
              <Field label="Action" className="w-56">
                <Select
                  value={url.action ?? ""}
                  onChange={(e) =>
                    setUrl({
                      action: AUDIT_ACTIONS.find((a) => a === e.target.value) ?? null,
                      page: null,
                    })
                  }
                >
                  <option value="">Toutes les actions</option>
                  {AUDIT_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {AUDIT_ACTION_LABEL[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Objet" className="w-44">
                <Select
                  value={url.entite ?? ""}
                  onChange={(e) =>
                    setUrl({
                      entite: AUDIT_ENTITIES.find((x) => x === e.target.value) ?? null,
                      page: null,
                    })
                  }
                >
                  <option value="">Tous les objets</option>
                  {AUDIT_ENTITIES.map((x) => (
                    <option key={x} value={x}>
                      {AUDIT_ENTITY_LABEL[x]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="N° de l'objet" className="w-32">
                <Input
                  value={url.objet}
                  onChange={(e) => setUrl({ objet: e.target.value, page: null })}
                />
              </Field>
              <Field label="N° de l'auteur" className="w-32">
                <Input
                  inputMode="numeric"
                  value={url.acteur !== null ? String(url.acteur) : ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setUrl({ acteur: Number.isInteger(n) && n > 0 ? n : null, page: null });
                  }}
                />
              </Field>
              {dateFields}
            </FilterBar>
            {audit.data ? (
              <>
                <DataTable
                  columns={auditColumns}
                  rows={audit.data.items}
                  getRowKey={(a) => a.id}
                  caption="Journal d'audit"
                  empty={empty}
                  emptyFiltered={emptyFiltered}
                />
                <PagerBar page={audit.data} noun="lignes" onPage={onPage} />
              </>
            ) : audit.error ? (
              <ErrorState error={audit.error} onRetry={audit.reload} />
            ) : (
              loadingState
            )}
          </TabsContent>
        ) : null}

        {allowed.includes("decisions-ia") ? (
          <TabsContent value="decisions-ia" className="mt-0 flex flex-col gap-4">
            <FilterBar
              resultCount={count}
              activeCount={journalFilterCount("decisions-ia", state)}
              onReset={resetFilters}
            >
              <Field label="Origine" className="w-40">
                <Select
                  value={url.type ?? ""}
                  onChange={(e) =>
                    setUrl({
                      type: DECISION_TYPES.find((t) => t === e.target.value) ?? null,
                      page: null,
                    })
                  }
                >
                  <option value="">IA et administrateurs</option>
                  <option value="AI">IA</option>
                  <option value="ADMIN">Administrateurs</option>
                </Select>
              </Field>
              <Field label="Décision" className="w-52">
                <Select
                  value={url.decision ?? ""}
                  onChange={(e) =>
                    setUrl({
                      decision: DECISION_VALUES.find((d) => d === e.target.value) ?? null,
                      page: null,
                    })
                  }
                >
                  <option value="">Toutes les décisions</option>
                  {DECISION_VALUES.map((d) => (
                    <option key={d} value={d}>
                      {
                        aiDecisionMeta(
                          d === "VALIDATED" || d === "VALIDATED_OVERRIDE" ? "ADMIN" : "AI",
                          d,
                        ).label
                      }
                    </option>
                  ))}
                </Select>
              </Field>
              {campaignField}
              {dateFields}
            </FilterBar>
            {decisions.data ? (
              <>
                <DataTable
                  columns={decisionColumns}
                  rows={decisions.data.items}
                  getRowKey={(d) => d.id}
                  caption="Décisions IA et administrateurs"
                  empty={empty}
                  emptyFiltered={emptyFiltered}
                />
                <PagerBar page={decisions.data} noun="décisions" onPage={onPage} />
              </>
            ) : decisions.error ? (
              <ErrorState error={decisions.error} onRetry={decisions.reload} />
            ) : (
              loadingState
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="diffusions" className="mt-0 flex flex-col gap-4">
          <FilterBar
            resultCount={count}
            activeCount={journalFilterCount("diffusions", state)}
            onReset={resetFilters}
          >
            <Field label="Zone" className="w-44">
              <Select
                value={url.zone !== null ? String(url.zone) : ""}
                onChange={(e) =>
                  setUrl({ zone: e.target.value ? Number(e.target.value) : null, page: null })
                }
              >
                <option value="">Toutes les zones</option>
                {(network.data?.zones ?? []).map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Porteur" className="w-48">
              <Select
                value={url.porteur !== null ? String(url.porteur) : ""}
                onChange={(e) =>
                  setUrl({ porteur: e.target.value ? Number(e.target.value) : null, page: null })
                }
              >
                <option value="">Tous les Porteurs</option>
                {(network.data?.supports ?? [])
                  .filter((s) => url.zone === null || s.zoneId === url.zone)
                  .map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Contenu" className="w-44">
              <Select
                value={url.contenu ?? ""}
                onChange={(e) =>
                  setUrl({
                    contenu: DIFFUSION_CONTENT_TYPES.find((t) => t === e.target.value) ?? null,
                    page: null,
                  })
                }
              >
                <option value="">Tous les contenus</option>
                {DIFFUSION_CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DIFFUSION_CONTENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {campaignField}
            {dateFields}
          </FilterBar>
          <p className="text-[0.8125rem] text-muted">
            Chaque appel d&apos;un lecteur d&apos;écran ajoute une ligne : publicité, message
            prioritaire ou contenu par défaut. Le coût n&apos;est débité que pour les publicités.
          </p>
          {diffusions.data ? (
            <>
              <DataTable
                columns={diffusionColumns}
                rows={diffusions.data.items}
                getRowKey={(l) => l.id}
                caption="Journal des diffusions"
                empty={empty}
                emptyFiltered={emptyFiltered}
              />
              <PagerBar page={diffusions.data} noun="diffusions" onPage={onPage} />
            </>
          ) : diffusions.error ? (
            <ErrorState error={diffusions.error} onRetry={diffusions.reload} />
          ) : (
            loadingState
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
