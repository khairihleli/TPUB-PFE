"use client";

import {
  BarChart3,
  Cpu,
  Gauge,
  History,
  ListChecks,
  MessageSquareWarning,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";

import { ColumnChart, ChartDataTable } from "@/components/admin/admin-charts";
import { PagerBar, PeriodPicker, RoleRestricted } from "@/components/admin/admin-controls";
import { FactList, ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  ADMIN_DECISION_LABEL,
  canManageCalibration,
  engineFacts,
  formatPrecision,
  kpiTiles,
  ocrHint,
  OUTCOME_META,
  parseOutcome,
  QUALITY_TAB_VALUES,
  QUALITY_TABS,
  rangeError,
  recalibrationMessage,
  thresholdTexts,
  TRIGGER_LABEL,
  weeklyDecisionPoints,
  weeklyErrorPoints,
  weeklyTableRows,
  weightSummary,
} from "@/components/admin/ai-quality-model";
import { formatWeight } from "@/components/admin/ai-rules-model";
import { PERIOD_PRESET_VALUES, periodRange } from "@/components/admin/stats-model";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { aiQualityApi } from "@/lib/api/endpoints-ia";
import { presentError } from "@/lib/api/errors";
import {
  AI_FEEDBACK_OUTCOMES,
  type AiCalibrationResponse,
  type AiFeedbackResponse,
  type AiRuleQuality,
} from "@/lib/api/types-ia";
import { AI_SEVERITY } from "@/lib/campaign-status";
import { formatDateRange, formatDateTime, formatNumber, todayISO } from "@/lib/format";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";
import { type ResourceState, useResource } from "@/lib/use-resource";

const TITLE = "Qualité de l'IA";
const FEEDBACK_PAGE_SIZE = 20;

const URL_SCHEMA = {
  periode: param.enum(PERIOD_PRESET_VALUES, "90"),
  du: param.string(),
  au: param.string(),
  onglet: param.enum(QUALITY_TAB_VALUES, "synthese"),
  resultat: param.string(),
  page: param.id(),
};

/** `/admin/ia-qualite` (docs/round2-contract.md §2.9): AI error dashboard, calibration and engines. */
export function AiQualityView() {
  const { role } = useSession();
  if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") {
    return (
      <RoleRestricted
        header={<PageHeader title={TITLE} />}
        title="Qualité de l'IA réservée aux administrateurs et superviseurs"
        description="Cette page compare les décisions des administrateurs aux avis de l'IA et règle ses seuils."
      />
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <QualityContent canManage={canManageCalibration(role)} />
    </Suspense>
  );
}

function QualityContent({ canManage }: { canManage: boolean }) {
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const today = todayISO();
  const range = periodRange(url.periode, today, { from: url.du, to: url.au });
  const invalidRange = rangeError(range.from, range.to);

  return (
    <>
      <PageHeader
        title={TITLE}
        description="Écarts entre l'avis de l'IA et les décisions des administrateurs, seuils appris et moteurs d'analyse."
      />

      <div className="mb-8 flex flex-col gap-2">
        <PeriodPicker
          preset={url.periode}
          from={url.periode === "custom" ? url.du || range.from : range.from}
          to={url.periode === "custom" ? url.au || range.to : range.to}
          onChange={(next) =>
            setUrl({
              periode: next.preset,
              du: next.preset === "custom" ? (next.from ?? "") : "",
              au: next.preset === "custom" ? (next.to ?? "") : "",
              page: null,
            })
          }
        />
        <p className="text-[0.8125rem] text-muted">
          Période analysée : {formatDateRange(range.from, range.to)}
        </p>
      </div>

      {invalidRange ? (
        <Alert tone="warning" title="Période invalide">
          {invalidRange}
        </Alert>
      ) : (
        <Tabs
          value={url.onglet}
          onValueChange={(v) => {
            const next = QUALITY_TAB_VALUES.find((t) => t === v);
            if (next) setUrl({ onglet: next, page: null });
          }}
          className="flex flex-col gap-6"
        >
          <TabsList aria-label="Sections de la qualité de l'IA" className="self-start">
            {QUALITY_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="synthese" className="mt-0 flex flex-col gap-10">
            <SummarySection from={range.from} to={range.to} canManage={canManage} />
            <EnginesSection />
          </TabsContent>
          <TabsContent value="retours" className="mt-0">
            <FeedbackSection
              from={range.from}
              to={range.to}
              outcome={parseOutcome(url.resultat)}
              page={url.page ?? 1}
              onOutcome={(outcome) => setUrl({ resultat: outcome, page: null })}
              onPage={(page) => setUrl({ page: page <= 0 ? null : page + 1 })}
            />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------
function SummarySection({ from, to, canManage }: { from: string; to: string; canManage: boolean }) {
  const quality = useResource(`admin:ai-quality:${from}:${to}`, (signal) =>
    aiQualityApi.quality({ from, to }, { signal }),
  );
  const calibrations = useResource("admin:ai-calibrations", (signal) =>
    aiQualityApi.calibrations({ signal }),
  );
  const reloadAll = () => {
    quality.reload();
    calibrations.reload();
  };

  const ruleColumns: DataTableColumn<AiRuleQuality>[] = [
    {
      key: "rule",
      header: "Règle",
      primary: true,
      sortable: true,
      sortValue: (r) => r.ruleName,
      cell: (r) => (
        <span className="font-label font-semibold text-ink-strong">
          {r.ruleName}
          {r.active ? null : (
            <Badge tone="muted" size="sm" className="ml-2">
              Inactive
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "severity",
      header: "Gravité",
      cell: (r) => (
        <Badge tone={AI_SEVERITY[r.severity].tone} size="sm">
          {AI_SEVERITY[r.severity].label}
        </Badge>
      ),
    },
    {
      key: "matches",
      header: "Déclenchements",
      align: "right",
      sortable: true,
      sortValue: (r) => r.matches,
      cell: (r) => <span className="tabular">{formatNumber(r.matches)}</span>,
    },
    {
      key: "confirmed",
      header: "Confirmés",
      align: "right",
      sortable: true,
      sortValue: (r) => r.confirmed,
      cell: (r) => <span className="tabular">{formatNumber(r.confirmed)}</span>,
    },
    {
      key: "fp",
      header: "Faux positifs",
      align: "right",
      sortable: true,
      sortValue: (r) => r.falsePositives,
      cell: (r) => <span className="tabular">{formatNumber(r.falsePositives)}</span>,
    },
    {
      key: "precision",
      header: "Précision",
      align: "right",
      sortable: true,
      sortValue: (r) => r.precision,
      nowrap: true,
      cell: (r) => <span className="tabular">{formatPrecision(r.precision)}</span>,
    },
    {
      key: "weight",
      header: "Poids appris",
      align: "right",
      sortable: true,
      sortValue: (r) => r.weight,
      nowrap: true,
      cell: (r) => <span className="tabular">{formatWeight(r.weight)}</span>,
    },
  ];

  return (
    <>
      <SectionCard
        icon={Gauge}
        title="Erreurs de l'IA"
        description="Chaque décision d'un administrateur (validation, dérogation ou refus) comparée à l'avis de l'IA."
        aside={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw aria-hidden="true" />}
            loading={quality.loading && quality.data !== undefined}
            loadingLabel="Actualisation…"
            onClick={reloadAll}
          >
            Actualiser
          </Button>
        }
      >
        <div aria-live="polite">
          {quality.data ? (
            quality.data.feedbackCount === 0 ? (
              <EmptyState
                compact
                icon={<MessageSquareWarning />}
                title="Aucune décision administrateur sur la période"
                description="Les écarts apparaissent dès qu'un administrateur valide ou refuse une campagne analysée par l'IA."
              />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {kpiTiles(quality.data).map((t) => (
                    <StatCard
                      key={t.key}
                      label={t.label}
                      value={t.value}
                      hint={t.hint}
                      accent={t.accent}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                      <BarChart3 aria-hidden="true" className="size-4 text-brand-blue-text" />
                      Décisions par semaine
                    </h3>
                    <ColumnChart
                      points={weeklyDecisionPoints(quality.data)}
                      label="Décisions administrateur par semaine"
                      valueLabel="Décisions"
                    />
                  </div>
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                      <MessageSquareWarning aria-hidden="true" className="size-4 text-warning" />
                      Erreurs par semaine
                    </h3>
                    <ColumnChart
                      points={weeklyErrorPoints(quality.data)}
                      label="Faux positifs et faux négatifs par semaine"
                      valueLabel="Erreurs"
                    />
                  </div>
                </div>
                <ChartDataTable
                  caption="Détail hebdomadaire des décisions"
                  headers={["Semaine", "Décisions", "Faux positifs", "Faux négatifs", "Dérogations"]}
                  rows={weeklyTableRows(quality.data)}
                />
              </div>
            )
          ) : quality.error ? (
            <ErrorState error={quality.error} onRetry={quality.reload} scope="section" />
          ) : (
            <LoadingRegion label="Chargement de la qualité de l'IA…">
              <Skeleton className="h-56 w-full" />
            </LoadingRegion>
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={ListChecks}
        title="Précision par règle"
        description="Déclenchements des règles sur les décisions de la période ; la précision est la part des refus confirmés."
      >
        {quality.data ? (
          <DataTable
            columns={ruleColumns}
            rows={quality.data.perRule}
            getRowKey={(r) => r.ruleId}
            caption="Précision par règle de modération"
            manualSort
            empty={
              <EmptyState
                compact
                icon={<ListChecks />}
                title="Aucune règle déclenchée sur la période"
                description="Les règles apparaissent ici lorsqu'elles ont signalé une campagne ensuite décidée."
              />
            }
          />
        ) : quality.error ? (
          <p className="text-sm text-muted">Tableau indisponible : voir l&apos;erreur ci-dessus.</p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </SectionCard>

      <CalibrationSection
        calibrations={calibrations}
        canManage={canManage}
        onChanged={reloadAll}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------
function CalibrationSection({
  calibrations,
  canManage,
  onChanged,
}: {
  calibrations: ResourceState<AiCalibrationResponse[]>;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { role } = useSession();
  const [recalibrating, setRecalibrating] = useState(false);
  const [activating, setActivating] = useState<AiCalibrationResponse | null>(null);
  const active = calibrations.data?.find((c) => c.active);

  const recalibrate = async () => {
    if (recalibrating) return;
    setRecalibrating(true);
    try {
      const created = await aiQualityApi.recalibrate();
      const message = recalibrationMessage(created);
      toast({ title: message.title, description: message.description, variant: "success" });
      onChanged();
    } catch (e) {
      toast({
        title: "Recalibration impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setRecalibrating(false);
    }
  };

  const columns: DataTableColumn<AiCalibrationResponse>[] = [
    {
      key: "version",
      header: "Version",
      primary: true,
      cell: (c) => (
        <span className="font-label font-semibold text-ink-strong tabular">
          v{c.version}
          {c.active ? (
            <Badge tone="success" size="sm" className="ml-2">
              Active
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "trigger",
      header: "Origine",
      cell: (c) => TRIGGER_LABEL[c.trigger],
    },
    {
      key: "thresholds",
      header: "Seuils (revue / refus)",
      align: "right",
      nowrap: true,
      cell: (c) => (
        <span className="tabular">
          {c.approveThreshold} / {c.rejectThreshold}
        </span>
      ),
    },
    {
      key: "weights",
      header: "Poids",
      cell: (c) => <span className="text-[0.8125rem] text-ink-soft">{weightSummary(c)}</span>,
    },
    {
      key: "feedback",
      header: "Décisions",
      align: "right",
      cell: (c) => (
        <span className="tabular" title={`${c.falsePositives} faux positifs, ${c.falseNegatives} faux négatifs`}>
          {formatNumber(c.feedbackCount)}
        </span>
      ),
    },
    {
      key: "changed",
      header: "Changement",
      cell: (c) =>
        c.trigger === "INITIAL" ? (
          <span className="text-muted">—</span>
        ) : c.changed ? (
          <Badge tone="info" size="sm">
            Nouveaux réglages
          </Badge>
        ) : (
          <Badge tone="muted" size="sm">
            Identique
          </Badge>
        ),
    },
    {
      key: "created",
      header: "Créée le",
      nowrap: true,
      cell: (c) => (
        <span>
          {formatDateTime(c.createdAt)}
          {c.createdByName ? <span className="block text-[0.75rem] text-muted">{c.createdByName}</span> : null}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      icon={SlidersHorizontal}
      title="Calibration"
      description="Seuils de décision et poids des règles recalculés à partir des décisions des administrateurs (fenêtre glissante, variations bornées)."
      aside={
        canManage ? (
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<RefreshCw aria-hidden="true" />}
            loading={recalibrating}
            loadingLabel="Recalibration…"
            onClick={recalibrate}
          >
            Recalibrer maintenant
          </Button>
        ) : null
      }
    >
      {calibrations.data ? (
        <div className="flex flex-col gap-5">
          {!canManage ? (
            <ReadOnlyNotice role={role}>
              Lecture seule : seuls les administrateurs recalibrent ou activent une version.
            </ReadOnlyNotice>
          ) : null}
          {active ? (
            <FactList
              items={[
                { label: "Version active", value: `v${active.version} (${TRIGGER_LABEL[active.trigger].toLowerCase()})` },
                { label: "Revue", value: thresholdTexts(active).review },
                { label: "Refus", value: thresholdTexts(active).reject },
                { label: "Poids des règles", value: weightSummary(active), wide: true },
              ]}
            />
          ) : (
            <Alert tone="warning" title="Aucune version active">
              Les seuils par défaut s&apos;appliquent (revue à partir d&apos;un risque de 31, refus au-delà de 70).
            </Alert>
          )}
          <div>
            <h3 className="mb-3 flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
              <History aria-hidden="true" className="size-4 text-brand-blue-text" />
              Historique des versions
            </h3>
            <DataTable
              columns={columns}
              rows={calibrations.data}
              getRowKey={(c) => c.version}
              caption="Historique des calibrations"
              manualSort
              rowActionsLabel="Actions"
              rowActions={
                canManage
                  ? (c) =>
                      c.active ? null : (
                        <Button variant="secondary" size="sm" onClick={() => setActivating(c)}>
                          Activer cette version
                        </Button>
                      )
                  : undefined
              }
              empty={
                <EmptyState
                  compact
                  icon={<History />}
                  title="Aucune version enregistrée"
                  description="La version initiale est créée par la migration de la base."
                />
              }
            />
          </div>
        </div>
      ) : calibrations.error ? (
        <ErrorState error={calibrations.error} onRetry={calibrations.reload} scope="section" />
      ) : (
        <Skeleton className="h-40 w-full" />
      )}

      <ConfirmDialog
        open={activating !== null}
        onOpenChange={(open) => {
          if (!open) setActivating(null);
        }}
        tone="primary"
        title={activating ? `Activer la version ${activating.version} ?` : "Activer la version"}
        description={
          activating
            ? `${thresholdTexts(activating).review}, ${thresholdTexts(activating).reject.toLowerCase()}. Les prochaines analyses utiliseront ces réglages.`
            : undefined
        }
        confirmLabel="Activer cette version"
        onConfirm={async () => {
          if (!activating) return;
          const updated = await aiQualityApi.activate(activating.version);
          toast({ title: `Version ${updated.version} activée`, variant: "success" });
          setActivating(null);
          onChanged();
        }}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Moteurs
// ---------------------------------------------------------------------------
function EnginesSection() {
  const providers = useResource("admin:ai-providers", (signal) => aiQualityApi.providers({ signal }));
  const hint = providers.data ? ocrHint(providers.data) : null;
  return (
    <SectionCard
      icon={Cpu}
      title="Moteurs"
      description="Moteurs réellement utilisés par le serveur pour les prochaines analyses (aucune clé n'est affichée)."
    >
      {providers.data ? (
        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {engineFacts(providers.data).map((f) => (
              <li key={f.label} className="rounded-control border border-line bg-overlay-inset px-4 py-3">
                <p className="text-[0.75rem] font-semibold tracking-wide text-muted uppercase">{f.label}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.875rem] text-ink-strong">
                  <Badge tone={f.tone} size="sm">
                    {f.tone === "success" ? "Actif" : f.tone === "warning" ? "Dégradé" : "Local"}
                  </Badge>
                  {f.value}
                </p>
              </li>
            ))}
          </ul>
          {hint ? (
            <Alert tone="warning" title="OCR simulé">
              {providers.data.ocr.reason ? `${providers.data.ocr.reason}. ` : null}
              {hint}
            </Alert>
          ) : null}
        </div>
      ) : providers.error ? (
        <ErrorState error={providers.error} onRetry={providers.reload} scope="section" />
      ) : (
        <Skeleton className="h-28 w-full" />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Retours
// ---------------------------------------------------------------------------
function FeedbackSection({
  from,
  to,
  outcome,
  page,
  onOutcome,
  onPage,
}: {
  from: string;
  to: string;
  outcome: AiFeedbackResponse["outcome"] | "";
  /** 1-based page from the URL. */
  page: number;
  onOutcome: (outcome: string) => void;
  onPage: (zeroBasedPage: number) => void;
}) {
  const zeroPage = Math.max(0, page - 1);
  const feedback = useResource(`admin:ai-feedback:${from}:${to}:${outcome}:${zeroPage}`, (signal) =>
    aiQualityApi.feedback(
      {
        from,
        to,
        outcome: outcome ? [outcome] : undefined,
        page: zeroPage,
        size: FEEDBACK_PAGE_SIZE,
      },
      { signal },
    ),
  );

  const columns: DataTableColumn<AiFeedbackResponse>[] = [
    {
      key: "campaign",
      header: "Campagne",
      primary: true,
      cell: (f) => (
        <Link
          href={routes.admin.moderation({ onglet: "toutes", examen: f.campaignId })}
          className="font-label font-semibold text-brand-blue-text underline-offset-2 hover:underline"
        >
          {f.campaignName}
        </Link>
      ),
    },
    {
      key: "outcome",
      header: "Résultat",
      mobileMeta: true,
      cell: (f) => (
        <Badge tone={OUTCOME_META[f.outcome].tone} size="sm" title={OUTCOME_META[f.outcome].description}>
          {OUTCOME_META[f.outcome].label}
        </Badge>
      ),
    },
    {
      key: "decision",
      header: "Décision",
      cell: (f) => (
        <span>
          {ADMIN_DECISION_LABEL[f.adminDecision]}
          {f.decidedByName ? <span className="block text-[0.75rem] text-muted">{f.decidedByName}</span> : null}
        </span>
      ),
    },
    {
      key: "scores",
      header: "Risque / qualité",
      align: "right",
      nowrap: true,
      cell: (f) => (
        <span className="tabular">
          {f.riskScore} / {f.qualityScore}
        </span>
      ),
    },
    {
      key: "calibration",
      header: "Calibration",
      align: "right",
      cell: (f) => (f.calibrationVersion === null ? "—" : `v${f.calibrationVersion}`),
    },
    {
      key: "date",
      header: "Date",
      nowrap: true,
      cell: (f) => formatDateTime(f.createdAt),
    },
  ];

  return (
    <SectionCard
      icon={MessageSquareWarning}
      title="Retours des administrateurs"
      description="Décisions comparées à l'avis de l'IA, des plus récentes aux plus anciennes."
      aside={
        <Field label="Résultat" className="w-56">
          <Select value={outcome} onChange={(e) => onOutcome(parseOutcome(e.target.value))}>
            <option value="">Tous les résultats</option>
            {AI_FEEDBACK_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_META[o].label}
              </option>
            ))}
          </Select>
        </Field>
      }
    >
      <div aria-live="polite">
        {feedback.data ? (
          <div className="flex flex-col gap-3">
            <DataTable
              columns={columns}
              rows={feedback.data.items}
              getRowKey={(f) => f.id}
              caption="Retours des administrateurs"
              manualSort
              empty={
                <EmptyState
                  compact
                  icon={<MessageSquareWarning />}
                  title={
                    outcome
                      ? "Aucun retour de ce type sur la période"
                      : "Aucune décision administrateur sur la période"
                  }
                  description="Les retours sont créés à chaque validation ou refus d'une campagne analysée."
                />
              }
            />
            <PagerBar page={feedback.data} noun="retours" onPage={onPage} />
          </div>
        ) : feedback.error ? (
          <ErrorState error={feedback.error} onRetry={feedback.reload} scope="section" />
        ) : (
          <LoadingRegion label="Chargement des retours…">
            <Skeleton className="h-56 w-full" />
          </LoadingRegion>
        )}
      </div>
    </SectionCard>
  );
}
