"use client";

import { ListChecks, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import { RoleRestricted } from "@/components/admin/admin-controls";
import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  activeCalibration,
  filterRules,
  formatWeight,
  learnedWeight,
  weightedPoints,
  keywordList,
  RULE_DESCRIPTION_MAX,
  RULE_FIELDS,
  RULE_NAME_MAX,
  RULE_PATTERN_MAX,
  RULE_TYPE_LABEL,
  RULE_TYPES,
  type RuleField,
  type RuleFilters,
  type RuleFormValues,
  ruleFormFrom,
  ruleRequestFrom,
  ruleSchema,
  ruleServerErrors,
  rulesSummary,
  SEVERITIES,
  SEVERITY_POINTS,
  testRule,
} from "@/components/admin/ai-rules-model";
import { firstIssues, focusFirstInvalid, type FormErrors } from "@/components/admin/form-utils";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { aiApi } from "@/lib/api/endpoints";
import { aiQualityApi } from "@/lib/api/endpoints-ia";
import { presentError } from "@/lib/api/errors";
import { AI_SECTORS, type AiRuleResponse } from "@/lib/api/types";
import { AI_SECTOR_LABEL, AI_SEVERITY } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const EMPTY_FILTERS: RuleFilters = { q: "", type: "", severity: "", active: "" };

export function AiRulesView() {
  const { role, canAct } = useSession();
  if (role === "OPERATEUR") {
    return (
      <RoleRestricted
        header={<PageHeader title="Règles IA" />}
        title="Règles réservées aux administrateurs et superviseurs"
        description="Les règles de modération décident des mots et expressions signalés par l'IA."
      />
    );
  }
  return <RulesContent canAct={canAct} role={role} />;
}

function RulesContent({
  canAct,
  role,
}: {
  canAct: boolean;
  role: ReturnType<typeof useSession>["role"];
}) {
  const { toast } = useToast();
  const rules = useResource("admin:ai-rules", (signal) => aiApi.rules.list({ signal }));
  const calibrations = useResource("admin:ai-calibrations", (signal) =>
    aiQualityApi.calibrations({ signal }),
  );
  const calibration = activeCalibration(calibrations.data);
  const [filters, setFilters] = useState<RuleFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<{ open: boolean; rule: AiRuleResponse | null }>({
    open: false,
    rule: null,
  });
  const [toDelete, setToDelete] = useState<AiRuleResponse | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const rows = rules.data ? filterRules(rules.data, filters) : [];
  const activeCount = [filters.type, filters.severity, filters.active].filter(Boolean).length;

  const upsert = (rule: AiRuleResponse) =>
    rules.setData((prev) => {
      const list = prev ?? [];
      return list.some((r) => r.id === rule.id)
        ? list.map((r) => (r.id === rule.id ? rule : r))
        : [...list, rule];
    });

  const toggle = async (rule: AiRuleResponse) => {
    if (toggling !== null) return;
    setToggling(rule.id);
    try {
      const saved = await aiApi.rules.update(
        rule.id,
        ruleRequestFrom(rule, { isActive: !rule.isActive }),
      );
      upsert(saved);
      toast({
        title: saved.isActive
          ? `Règle « ${saved.ruleName} » activée`
          : `Règle « ${saved.ruleName} » désactivée`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Modification impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setToggling(null);
    }
  };

  const columns: DataTableColumn<AiRuleResponse>[] = [
    {
      key: "name",
      header: "Règle",
      primary: true,
      className: "min-w-[12rem]",
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IdChip id={r.id} />
            <span className="font-label font-semibold text-ink-strong">{r.ruleName}</span>
          </div>
          {r.description ? (
            <p className="mt-1 line-clamp-2 max-w-[26rem] text-[0.8125rem] text-muted">
              {r.description}
            </p>
          ) : null}
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (r) => RULE_TYPE_LABEL[r.ruleType] },
    {
      key: "pattern",
      header: "Motif",
      cell: (r) => (
        <code className="line-clamp-2 max-w-[18rem] rounded-sm bg-overlay-subtle px-1.5 py-0.5 font-mono text-[0.8125rem] break-all text-ink-soft">
          {r.pattern}
        </code>
      ),
    },
    {
      key: "severity",
      header: "Gravité",
      mobileMeta: true,
      cell: (r) => (
        <Badge
          tone={AI_SEVERITY[r.severity].tone}
          size="sm"
          title={`+${SEVERITY_POINTS[r.severity]} points de risque`}
        >
          {AI_SEVERITY[r.severity].label}
        </Badge>
      ),
    },
    {
      key: "weight",
      header: "Poids appris",
      align: "right",
      nowrap: true,
      cell: (r) => {
        if (calibrations.data === undefined) {
          return calibrations.error ? (
            <span className="text-muted" title="Poids indisponibles">
              —
            </span>
          ) : (
            <Skeleton className="ml-auto h-4 w-10" />
          );
        }
        const weight = learnedWeight(calibration, r.id);
        return (
          <span
            className={cx("tabular", weight === 1 ? "text-muted" : "font-semibold text-ink-strong")}
            title={`+${weightedPoints(r.severity, weight)} points de risque après pondération`}
          >
            {formatWeight(weight)}
          </span>
        );
      },
    },
    {
      key: "sector",
      header: "Secteur",
      cell: (r) =>
        r.sector ? AI_SECTOR_LABEL[r.sector] : <span className="text-muted">Tous</span>,
    },
    {
      key: "active",
      header: "Active",
      cell: (r) =>
        canAct ? (
          <Checkbox
            className="-my-2"
            checked={r.isActive}
            disabled={toggling === r.id}
            onChange={() => void toggle(r)}
            label={<span className="sr-only">Règle « {r.ruleName} » active</span>}
          />
        ) : (
          <Badge tone={r.isActive ? "success" : "muted"} size="sm">
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
    },
    {
      key: "updated",
      header: "Modifiée",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-[0.8125rem] whitespace-nowrap text-muted">
          {formatDateTime(r.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Règles IA"
        description="Mots interdits, allégations trompeuses et contenus sensibles : chaque règle déclenchée ajoute des points de risque à l'analyse IA, qui propose un avis avant la décision humaine."
        primaryAction={
          canAct ? (
            <Button
              variant="primary"
              iconLeft={<Plus aria-hidden="true" />}
              onClick={() => setEditing({ open: true, rule: null })}
            >
              Nouvelle règle
            </Button>
          ) : undefined
        }
        secondaryActions={
          <Button
            variant="secondary"
            iconLeft={<RefreshCw aria-hidden="true" />}
            loading={rules.loading && rules.data !== undefined}
            loadingLabel="Actualisation…"
            onClick={rules.reload}
          >
            Actualiser
          </Button>
        }
      />
      {!canAct ? (
        <ReadOnlyNotice role={role} className="mb-6">
          Vous consultez les règles ; leur création et leur modification sont réservées aux
          administrateurs.
        </ReadOnlyNotice>
      ) : null}

      {rules.data ? (
        <div className="flex flex-col gap-4">
          {calibrations.error && calibrations.data === undefined ? (
            <Alert
              tone="warning"
              title="Poids appris indisponibles"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<RefreshCw aria-hidden="true" />}
                  loading={calibrations.loading}
                  loadingLabel="Nouvel essai…"
                  onClick={calibrations.reload}
                >
                  Réessayer
                </Button>
              }
            >
              {presentError(calibrations.error).message} Les règles restent consultables.
            </Alert>
          ) : calibration ? (
            <p className="text-[0.8125rem] text-muted">
              Poids appris de la calibration v{calibration.version} : revue à partir d&apos;un
              risque de {calibration.approveThreshold}, refus au-delà de{" "}
              {calibration.rejectThreshold}.{" "}
              <Link
                href="/admin/ia-qualite"
                className="font-semibold text-brand-blue-text underline"
              >
                Qualité de l&apos;IA
              </Link>
            </p>
          ) : null}
          <FilterBar
            search={{
              value: filters.q,
              onChange: (q) => setFilters((f) => ({ ...f, q })),
              placeholder: "Nom, motif ou description",
              label: "Rechercher une règle",
            }}
            resultCount={rulesSummary(rules.data)}
            activeCount={activeCount}
            onReset={() => setFilters(EMPTY_FILTERS)}
          >
            <Field label="Type" className="w-48">
              <Select
                value={filters.type}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    type: RULE_TYPES.find((t) => t === e.target.value) ?? "",
                  }))
                }
              >
                <option value="">Tous les types</option>
                {RULE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RULE_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gravité" className="w-40">
              <Select
                value={filters.severity}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    severity: SEVERITIES.find((s) => s === e.target.value) ?? "",
                  }))
                }
              >
                <option value="">Toutes</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {AI_SEVERITY[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="État" className="w-40">
              <Select
                value={filters.active}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    active:
                      e.target.value === "actives" || e.target.value === "inactives"
                        ? e.target.value
                        : "",
                  }))
                }
              >
                <option value="">Toutes</option>
                <option value="actives">Actives</option>
                <option value="inactives">Inactives</option>
              </Select>
            </Field>
          </FilterBar>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            caption="Règles de modération IA"
            rowActions={
              canAct
                ? (r) => (
                    <span className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        iconLeft={<Pencil aria-hidden="true" />}
                        aria-label={`Modifier la règle ${r.ruleName}`}
                        onClick={() => setEditing({ open: true, rule: r })}
                      >
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Supprimer la règle ${r.ruleName}`}
                        onClick={() => setToDelete(r)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </span>
                  )
                : undefined
            }
            emptyFiltered={
              rules.data.length > 0 ? (
                <EmptyState
                  compact
                  icon={<Search />}
                  title="Aucune règle pour ces filtres"
                  action={
                    <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Réinitialiser les filtres
                    </Button>
                  }
                />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={<ListChecks />}
                title="Aucune règle de modération"
                description="Sans règle, l'IA n'applique que ses contrôles de qualité (texte, visuels, doublons)."
              />
            }
          />
        </div>
      ) : rules.error ? (
        <ErrorState error={rules.error} onRetry={rules.reload} />
      ) : (
        <LoadingRegion label="Chargement des règles…" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </LoadingRegion>
      )}

      <RuleFormDialog
        open={editing.open}
        rule={editing.rule}
        onOpenChange={(open) => setEditing((d) => ({ ...d, open }))}
        onSaved={(rule, created) => {
          upsert(rule);
          toast({ title: created ? "Règle créée" : "Règle mise à jour", variant: "success" });
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={toDelete ? `Supprimer la règle « ${toDelete.ruleName} » ?` : "Supprimer la règle ?"}
        description="Les analyses déjà faites ne changent pas. Pour suspendre la règle sans la perdre, désactivez-la plutôt."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!toDelete) return;
          await aiApi.rules.remove(toDelete.id);
          const id = toDelete.id;
          rules.setData((prev) => (prev ?? []).filter((r) => r.id !== id));
          toast({ title: "Règle supprimée", variant: "success" });
        }}
      />
    </>
  );
}

export function RuleFormDialog({
  open,
  rule,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  rule: AiRuleResponse | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (rule: AiRuleResponse, created: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <RuleForm
          key={rule?.id ?? "nouvelle"}
          rule={rule}
          onSaved={(saved) => {
            onSaved(saved, rule === null);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function RuleForm({
  rule,
  onSaved,
}: {
  rule: AiRuleResponse | null;
  onSaved: (r: AiRuleResponse) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<RuleFormValues>(() => ruleFormFrom(rule));
  const [errors, setErrors] = useState<FormErrors<RuleField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState("");
  const matches = testRule(values, sample);

  const set = <K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = ruleSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, RULE_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      const saved = rule
        ? await aiApi.rules.update(rule.id, parsed.data)
        : await aiApi.rules.create(parsed.data);
      onSaved(saved);
    } catch (err) {
      const fieldErrors = ruleServerErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        focusFirstInvalid(formRef.current);
      } else {
        setFormError(presentError(err).message);
      }
      setSaving(false);
    }
  };

  const keywords = values.ruleType === "KEYWORD" ? keywordList(values.pattern) : [];

  return (
    <DialogContent
      size="lg"
      title={rule ? `Modifier « ${rule.ruleName} »` : "Nouvelle règle de modération"}
      description="Le texte (nom et objectif) et le texte lu dans les visuels sont comparés sans accents ni majuscules."
      dirty={JSON.stringify(values) !== JSON.stringify(ruleFormFrom(rule)) && !saving}
      preventOutsideClose={saving}
      footer={
        <Button
          type="submit"
          form="regle-ia-form"
          variant="primary"
          loading={saving}
          loadingLabel="Enregistrement"
        >
          {rule ? "Enregistrer" : "Créer la règle"}
        </Button>
      }
    >
      <form
        id="regle-ia-form"
        ref={formRef}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-5"
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field
            label="Nom"
            required
            error={errors.ruleName}
            hint={`${RULE_NAME_MAX} caractères maximum.`}
          >
            <Input
              value={values.ruleName}
              maxLength={RULE_NAME_MAX}
              placeholder="ex. promesse-gratuit-garanti"
              onChange={(e) => set("ruleName", e.target.value)}
            />
          </Field>
          <Field label="Type" required error={errors.ruleType}>
            <Select
              value={values.ruleType}
              onChange={(e) =>
                set("ruleType", RULE_TYPES.find((t) => t === e.target.value) ?? "KEYWORD")
              }
            >
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RULE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label={values.ruleType === "KEYWORD" ? "Mots ou expressions" : "Expression régulière"}
          required
          error={errors.pattern}
          hint={
            values.ruleType === "KEYWORD"
              ? `Séparés par des virgules, reconnus comme mots entiers.${keywords.length > 0 ? ` ${keywords.length} expression${keywords.length > 1 ? "s" : ""}.` : ""}`
              : "Syntaxe Java, insensible à la casse, appliquée au texte sans accents."
          }
        >
          <Textarea
            rows={3}
            className="font-mono text-[0.875rem]"
            maxLength={RULE_PATTERN_MAX}
            value={values.pattern}
            placeholder={
              values.ruleType === "KEYWORD" ? "gratuit, garanti, 100% garanti" : "\\b(rib|iban)\\b"
            }
            onChange={(e) => set("pattern", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field
            label="Gravité"
            required
            error={errors.severity}
            hint={`+${SEVERITY_POINTS[values.severity]} points de risque${values.severity === "CRITICAL" ? " : refus automatique par l'IA" : values.severity === "HIGH" ? " : revue manuelle obligatoire" : ""}.`}
          >
            <Select
              value={values.severity}
              onChange={(e) =>
                set("severity", SEVERITIES.find((s) => s === e.target.value) ?? "MEDIUM")
              }
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {AI_SEVERITY[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Secteur"
            error={errors.sector}
            hint="Information : la règle s'applique à toutes les campagnes."
          >
            <Select
              value={values.sector}
              onChange={(e) => set("sector", AI_SECTORS.find((s) => s === e.target.value) ?? "")}
            >
              <option value="">Tous les secteurs</option>
              {AI_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {AI_SECTOR_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Description"
          error={errors.description}
          hint={`${RULE_DESCRIPTION_MAX} caractères maximum.`}
        >
          <Textarea
            rows={2}
            className="min-h-16"
            maxLength={RULE_DESCRIPTION_MAX}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Checkbox
          label="Règle active"
          description="Une règle inactive est conservée mais n'est plus appliquée aux nouvelles analyses."
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        <div className="rounded-card border border-line bg-overlay-inset p-4">
          <Field
            label="Tester la règle"
            hint="Collez un texte d'annonce : l'aperçu reprend la comparaison du moteur (sans accents ni majuscules)."
          >
            <Textarea
              rows={2}
              className="min-h-16"
              value={sample}
              onChange={(e) => setSample(e.target.value)}
            />
          </Field>
          {sample.trim() ? (
            <p className="mt-2 text-sm" aria-live="polite">
              {matches.length > 0 ? (
                <span className="text-warning">
                  Règle déclenchée : {matches.map((m) => `« ${m} »`).join(", ")}
                </span>
              ) : (
                <span className="text-muted">Aucune correspondance.</span>
              )}
            </p>
          ) : null}
        </div>
      </form>
    </DialogContent>
  );
}
