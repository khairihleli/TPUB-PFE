"use client";

import {
  BadgeCheck,
  Building2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { type FormEvent, Suspense, useEffect, useRef, useState } from "react";

import { PagerBar, RoleRestricted } from "@/components/admin/admin-controls";
import { FactList, IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { firstIssues, focusFirstInvalid, type FormErrors } from "@/components/admin/form-utils";
import {
  accountServerErrors,
  accountTitle,
  clientValidationBody,
  clientValidationFormFrom,
  type ClientValidationValues,
  deactivationBlocker,
  deviceLabel,
  emptyStaffForm,
  passwordChangeBlocker,
  passwordResetBlocker,
  securityBadges,
  NOTES_MAX,
  STAFF_CREATE_FIELDS,
  STAFF_ROLE_VALUES,
  STAFF_UPDATE_FIELDS,
  type StaffCreateField,
  type StaffCreateValues,
  staffCreateSchema,
  type StaffUpdateField,
  type StaffUpdateValues,
  staffUpdateFormFrom,
  staffUpdateSchema,
  twoFactorResetBlocker,
  type UsersFilterState,
  usersFilterCount,
  usersQuery,
  USERS_TABS,
  type UsersTab,
  VALIDATION_EFFECT,
  VALIDATION_STATUSES,
} from "@/components/admin/users-model";
import { CopyButton } from "@/components/contact/copy-button";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, PasswordInput, Select, Textarea } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { adminUsersApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { AdminUserResponse } from "@/lib/api/types";
import { CLIENT_VALIDATION_STATUS, LOGIN_FAILURE_LABEL, ROLE_LABEL } from "@/lib/campaign-status";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const URL_SCHEMA = {
  onglet: param.enum(USERS_TABS, "annonceurs"),
  q: param.string(),
  etat: param.enum(["", "actifs", "inactifs"] as const, ""),
  validation: param.optionalEnum(VALIDATION_STATUSES),
  page: param.id(),
  utilisateur: param.id(),
};

export function UsersView() {
  const { role } = useSession();
  if (role === "OPERATEUR") {
    return (
      <RoleRestricted
        header={<PageHeader title="Utilisateurs" />}
        title="Comptes réservés aux administrateurs et superviseurs"
        description="La gestion des annonceurs et de l'équipe TPUB n'est pas ouverte aux opérateurs."
      />
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <UsersContent />
    </Suspense>
  );
}

function UsersContent() {
  const { role, canAct, user } = useSession();
  const { toast } = useToast();
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const [query, setQuery] = useState(url.q);
  useEffect(() => {
    if (query === url.q) return;
    const t = setTimeout(() => setUrl({ q: query, page: null }), 300);
    return () => clearTimeout(t);
  }, [query, url.q, setUrl]);

  const state: UsersFilterState = {
    tab: url.onglet,
    q: url.q,
    active: url.etat,
    validation: url.validation,
    page: url.page ?? 0,
  };
  const q = usersQuery(state);
  const list = useResource(`admin:users:${JSON.stringify(q)}`, (signal) =>
    adminUsersApi.list({ ...q, signal }),
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserResponse | null>(null);
  const [validating, setValidating] = useState<AdminUserResponse | null>(null);
  const [toggle, setToggle] = useState<AdminUserResponse | null>(null);

  const replace = (updated: AdminUserResponse) =>
    list.setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((u) => (u.userId === updated.userId ? updated : u)) }
        : { items: [updated], page: 0, size: 20, totalItems: 1, totalPages: 1 },
    );

  const actions = (u: AdminUserResponse) => (
    <span className="inline-flex flex-wrap justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Détails de ${accountTitle(u)}`}
        onClick={() => setUrl({ utilisateur: u.userId }, { history: "push" })}
      >
        Détails
      </Button>
      {canAct && u.role === "ANNONCEUR" && u.client ? (
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Valider ou suspendre ${accountTitle(u)}`}
          onClick={() => setValidating(u)}
        >
          Valider / suspendre
        </Button>
      ) : null}
      {canAct && u.role !== "ANNONCEUR" ? (
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Modifier ${u.nom}`}
          onClick={() => setEditing(u)}
        >
          Modifier
        </Button>
      ) : null}
      {canAct ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${u.isActive ? "Désactiver" : "Activer"} ${accountTitle(u)}`}
          disabledReason={deactivationBlocker(u, user.userId)}
          onClick={() => setToggle(u)}
        >
          {u.isActive ? "Désactiver" : "Activer"}
        </Button>
      ) : null}
    </span>
  );

  const security = (u: AdminUserResponse) =>
    securityBadges(u).map((b) => (
      <Badge key={b.label} tone={b.tone} size="sm">
        {b.label}
      </Badge>
    ));

  const activeBadge = (u: AdminUserResponse) => (
    <Badge tone={u.isActive ? "success" : "muted"} size="sm">
      {u.isActive ? "Actif" : "Désactivé"}
    </Badge>
  );

  const advertiserColumns: DataTableColumn<AdminUserResponse>[] = [
    {
      key: "company",
      header: "Annonceur",
      primary: true,
      cell: (u) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <IdChip id={u.userId} />
            <span className="font-label font-semibold text-ink-strong">{accountTitle(u)}</span>
            {security(u)}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">
            {u.nom} · {u.email}
          </p>
        </div>
      ),
    },
    {
      key: "validation",
      header: "Validation",
      mobileMeta: true,
      cell: (u) =>
        u.client ? (
          <Badge tone={CLIENT_VALIDATION_STATUS[u.client.validationStatus].tone} size="sm">
            {CLIENT_VALIDATION_STATUS[u.client.validationStatus].label}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "trust",
      header: "Confiance",
      align: "right",
      cell: (u) => (
        <span className="tabular">
          {u.client ? `${formatNumber(u.client.trustLevel)} / 100` : "—"}
        </span>
      ),
    },
    {
      key: "campaigns",
      header: "Campagnes",
      align: "right",
      cell: (u) => <span className="tabular">{formatNumber(u.campaignsCount)}</span>,
    },
    { key: "active", header: "Compte", cell: activeBadge },
    {
      key: "login",
      header: "Dernière connexion",
      cell: (u) => (
        <span className="text-[0.8125rem] whitespace-nowrap text-muted">
          {u.lastLoginAt ? capitalize(formatRelative(u.lastLoginAt)) : "Jamais"}
        </span>
      ),
    },
  ];

  const staffColumns: DataTableColumn<AdminUserResponse>[] = [
    {
      key: "name",
      header: "Membre",
      primary: true,
      cell: (u) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <IdChip id={u.userId} />
            <span className="font-label font-semibold text-ink-strong">{u.nom}</span>
            {u.userId === user.userId ? (
              <Badge tone="blue" size="sm">
                Vous
              </Badge>
            ) : null}
            {security(u)}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted">{u.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Rôle", mobileMeta: true, cell: (u) => ROLE_LABEL[u.role] },
    { key: "active", header: "Compte", cell: activeBadge },
    {
      key: "sessions",
      header: "Sessions actives",
      align: "right",
      cell: (u) => <span className="tabular">{formatNumber(u.activeSessions)}</span>,
    },
    {
      key: "login",
      header: "Dernière connexion",
      cell: (u) => (
        <span className="text-[0.8125rem] whitespace-nowrap text-muted">
          {u.lastLoginAt ? capitalize(formatRelative(u.lastLoginAt)) : "Jamais"}
        </span>
      ),
    },
  ];

  const tabContent = (tab: UsersTab) => (
    <TabsContent value={tab} className="mt-0 flex flex-col gap-4">
      <FilterBar
        search={{
          value: query,
          onChange: setQuery,
          placeholder: tab === "annonceurs" ? "Société, nom ou e-mail" : "Nom ou e-mail",
          label: "Rechercher un compte",
        }}
        resultCount={
          list.data
            ? `${formatNumber(list.data.totalItems)} compte${list.data.totalItems > 1 ? "s" : ""}`
            : undefined
        }
        activeCount={usersFilterCount(state)}
        onReset={() => {
          setQuery("");
          setUrl({ q: "", etat: "", validation: null, page: null });
        }}
      >
        {tab === "annonceurs" ? (
          <Field label="Validation" className="w-52">
            <Select
              value={url.validation ?? ""}
              onChange={(e) =>
                setUrl({
                  validation: VALIDATION_STATUSES.find((s) => s === e.target.value) ?? null,
                  page: null,
                })
              }
            >
              <option value="">Tous les statuts</option>
              {VALIDATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_VALIDATION_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Compte" className="w-40">
          <Select
            value={url.etat}
            onChange={(e) =>
              setUrl({
                etat:
                  e.target.value === "actifs" || e.target.value === "inactifs"
                    ? e.target.value
                    : "",
                page: null,
              })
            }
          >
            <option value="">Tous</option>
            <option value="actifs">Actifs</option>
            <option value="inactifs">Désactivés</option>
          </Select>
        </Field>
      </FilterBar>
      {list.data ? (
        <>
          <DataTable
            columns={tab === "annonceurs" ? advertiserColumns : staffColumns}
            rows={list.data.items}
            getRowKey={(u) => u.userId}
            caption={tab === "annonceurs" ? "Comptes annonceurs" : "Équipe TPUB"}
            rowActions={actions}
            emptyFiltered={
              usersFilterCount(state) > 0 || url.q ? (
                <EmptyState compact icon={<Search />} title="Aucun compte pour ces filtres" />
              ) : undefined
            }
            empty={
              <EmptyState
                icon={<UsersRound />}
                title={tab === "annonceurs" ? "Aucun annonceur inscrit" : "Aucun membre d'équipe"}
              />
            }
          />
          <PagerBar
            page={list.data}
            noun="comptes"
            onPage={(p) => setUrl({ page: p > 0 ? p : null })}
          />
        </>
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <LoadingRegion label="Chargement des comptes…" className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </LoadingRegion>
      )}
    </TabsContent>
  );

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Validation des comptes annonceurs, niveau de confiance et comptes de l'équipe TPUB."
        primaryAction={
          canAct ? (
            <Button
              variant="primary"
              iconLeft={<Plus aria-hidden="true" />}
              onClick={() => setCreating(true)}
            >
              Créer un compte d&apos;équipe
            </Button>
          ) : undefined
        }
        secondaryActions={
          <Button
            variant="secondary"
            iconLeft={<RefreshCw aria-hidden="true" />}
            onClick={list.reload}
          >
            Actualiser
          </Button>
        }
      />
      {!canAct ? (
        <ReadOnlyNotice role={role} className="mb-6">
          Vous consultez les comptes ; leur validation, leur création et leur désactivation sont
          réservées aux administrateurs.
        </ReadOnlyNotice>
      ) : null}

      <Tabs
        value={url.onglet}
        onValueChange={(v) => {
          const next = USERS_TABS.find((t) => t === v);
          if (next) {
            setQuery("");
            setUrl({ onglet: next, q: "", validation: null, etat: "", page: null });
          }
        }}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Comptes" className="self-start">
          <TabsTrigger value="annonceurs" icon={<Building2 />}>
            Annonceurs
          </TabsTrigger>
          <TabsTrigger value="equipe" icon={<ShieldCheck />}>
            Équipe TPUB
          </TabsTrigger>
        </TabsList>
        {tabContent("annonceurs")}
        {tabContent("equipe")}
      </Tabs>

      <StaffCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(u) => {
          toast({
            title: `Compte ${ROLE_LABEL[u.role].toLowerCase()} créé`,
            description: u.email,
            variant: "success",
          });
          if (url.onglet === "equipe") list.reload();
          else setUrl({ onglet: "equipe", page: null });
        }}
      />
      <StaffEditDialog
        user={editing}
        currentUserId={user.userId}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={(u) => {
          replace(u);
          toast({ title: "Compte mis à jour", variant: "success" });
        }}
      />
      <ClientValidationDialog
        user={validating}
        onOpenChange={(open) => {
          if (!open) setValidating(null);
        }}
        onSaved={(u) => {
          replace(u);
          toast({
            title: `${accountTitle(u)} : ${u.client ? CLIENT_VALIDATION_STATUS[u.client.validationStatus].label.toLowerCase() : "mis à jour"}`,
            variant: "success",
          });
        }}
      />
      <ConfirmDialog
        open={toggle !== null}
        onOpenChange={(open) => {
          if (!open) setToggle(null);
        }}
        tone={toggle?.isActive ? "danger" : "primary"}
        title={
          toggle
            ? `${toggle.isActive ? "Désactiver" : "Activer"} le compte de ${accountTitle(toggle)} ?`
            : ""
        }
        description={
          toggle?.isActive
            ? "Ses sessions sont révoquées immédiatement et la connexion lui est refusée jusqu'à réactivation."
            : "La personne pourra de nouveau se connecter."
        }
        confirmLabel={toggle?.isActive ? "Désactiver" : "Activer"}
        onConfirm={async () => {
          if (!toggle) return;
          const updated = toggle.isActive
            ? await adminUsersApi.deactivate(toggle.userId)
            : await adminUsersApi.activate(toggle.userId);
          replace(updated);
          toast({
            title: updated.isActive ? "Compte activé" : "Compte désactivé",
            variant: "success",
          });
        }}
      />
      <UserDetailDialog
        userId={url.utilisateur}
        canAct={canAct}
        currentUserId={user.userId}
        onUpdated={replace}
        onOpenChange={(open) => {
          if (!open) setUrl({ utilisateur: null });
        }}
      />
    </>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
export function StaffCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (u: AdminUserResponse) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <StaffCreateForm
          onCreated={(u) => {
            onCreated(u);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function StaffCreateForm({ onCreated }: { onCreated: (u: AdminUserResponse) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<StaffCreateValues>(emptyStaffForm);
  const [errors, setErrors] = useState<FormErrors<StaffCreateField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: StaffCreateField, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = staffCreateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, STAFF_CREATE_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      onCreated(await adminUsersApi.create(parsed.data));
    } catch (err) {
      const fields = accountServerErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(presentError(err).message);
      setSaving(false);
    }
  };
  return (
    <DialogContent
      title="Créer un compte d'équipe"
      description="Administrateur : toutes les actions. Superviseur : consultation. Opérateur : réseau, urgences et diffusions."
      preventOutsideClose={saving}
      footer={
        <Button
          type="submit"
          form="compte-equipe"
          variant="primary"
          loading={saving}
          loadingLabel="Création"
        >
          Créer le compte
        </Button>
      }
    >
      <form
        id="compte-equipe"
        ref={formRef}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label="Nom" required error={errors.nom}>
          <Input
            value={values.nom}
            autoComplete="off"
            onChange={(e) => set("nom", e.target.value)}
          />
        </Field>
        <Field label="Adresse e-mail" required error={errors.email}>
          <Input
            type="email"
            value={values.email}
            autoComplete="off"
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field
          label="Mot de passe initial"
          required
          error={errors.password}
          hint="8 caractères minimum, avec au moins une lettre et un chiffre. Transmettez-le de façon sécurisée."
        >
          <PasswordInput
            value={values.password}
            autoComplete="new-password"
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <Field label="Rôle" required error={errors.role}>
          <Select value={values.role} onChange={(e) => set("role", e.target.value)}>
            {STAFF_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field label="Service ou société" error={errors.societe}>
            <Input value={values.societe} onChange={(e) => set("societe", e.target.value)} />
          </Field>
          <Field label="Téléphone" error={errors.telephone}>
            <Input
              type="tel"
              value={values.telephone}
              onChange={(e) => set("telephone", e.target.value)}
            />
          </Field>
        </div>
      </form>
    </DialogContent>
  );
}

function StaffEditDialog({
  user,
  currentUserId,
  onOpenChange,
  onSaved,
}: {
  user: AdminUserResponse | null;
  currentUserId: number;
  onOpenChange: (open: boolean) => void;
  onSaved: (u: AdminUserResponse) => void;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      {user ? (
        <StaffEditForm
          key={user.userId}
          user={user}
          canChangeRole={user.userId !== currentUserId}
          onSaved={(u) => {
            onSaved(u);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function StaffEditForm({
  user,
  canChangeRole,
  onSaved,
}: {
  user: AdminUserResponse;
  canChangeRole: boolean;
  onSaved: (u: AdminUserResponse) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<StaffUpdateValues>(() => staffUpdateFormFrom(user));
  const [errors, setErrors] = useState<FormErrors<StaffUpdateField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: StaffUpdateField, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = staffUpdateSchema(canChangeRole).safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, STAFF_UPDATE_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      onSaved(await adminUsersApi.update(user.userId, parsed.data));
    } catch (err) {
      const fields = accountServerErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(presentError(err).message);
      setSaving(false);
    }
  };
  return (
    <DialogContent
      title={`Modifier ${user.nom}`}
      description={user.email}
      preventOutsideClose={saving}
      footer={
        <Button
          type="submit"
          form="modifier-compte"
          variant="primary"
          loading={saving}
          loadingLabel="Enregistrement"
        >
          Enregistrer
        </Button>
      }
    >
      <form
        id="modifier-compte"
        ref={formRef}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label="Nom" required error={errors.nom}>
          <Input value={values.nom} onChange={(e) => set("nom", e.target.value)} />
        </Field>
        <Field
          label="Rôle"
          error={errors.role}
          hint={canChangeRole ? undefined : "Vous ne pouvez pas modifier votre propre rôle."}
        >
          <Select
            value={values.role}
            disabled={!canChangeRole}
            onChange={(e) => set("role", e.target.value)}
          >
            {STAFF_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Field label="Service ou société" error={errors.societe}>
            <Input value={values.societe} onChange={(e) => set("societe", e.target.value)} />
          </Field>
          <Field label="Téléphone" error={errors.telephone}>
            <Input
              type="tel"
              value={values.telephone}
              onChange={(e) => set("telephone", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Adresse" error={errors.adresse}>
          <Textarea
            rows={2}
            className="min-h-16"
            value={values.adresse}
            onChange={(e) => set("adresse", e.target.value)}
          />
        </Field>
      </form>
    </DialogContent>
  );
}

export function ClientValidationDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: AdminUserResponse | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (u: AdminUserResponse) => void;
}) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      {user?.client ? (
        <ClientValidationForm
          key={user.userId}
          user={user}
          onSaved={(u) => {
            onSaved(u);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function ClientValidationForm({
  user,
  onSaved,
}: {
  user: AdminUserResponse;
  onSaved: (u: AdminUserResponse) => void;
}) {
  const [values, setValues] = useState<ClientValidationValues>(() =>
    clientValidationFormFrom(user),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !user.client) return;
    const body = clientValidationBody(values);
    if ("error" in body) {
      setError(body.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await adminUsersApi.setClientValidation(user.client.clientId, body));
    } catch (err) {
      setError(presentError(err).message);
      setSaving(false);
    }
  };
  return (
    <DialogContent
      title={`Validation de ${accountTitle(user)}`}
      description={`${user.nom} · ${user.email} · ${formatNumber(user.campaignsCount)} campagne${user.campaignsCount > 1 ? "s" : ""}`}
      preventOutsideClose={saving}
      footer={
        <Button
          type="submit"
          form="validation-annonceur"
          variant="primary"
          loading={saving}
          loadingLabel="Enregistrement"
        >
          Enregistrer la décision
        </Button>
      }
    >
      <form id="validation-annonceur" noValidate onSubmit={submit} className="flex flex-col gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-label text-[0.875rem] font-semibold text-ink-strong">
            Statut du compte
          </legend>
          {VALIDATION_STATUSES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-start gap-3 rounded-control border border-line px-3 py-2.5 has-[:checked]:border-brand-blue-text has-[:checked]:bg-blue-soft"
            >
              <input
                type="radio"
                name="validationStatus"
                value={s}
                checked={values.validationStatus === s}
                onChange={() => setValues((v) => ({ ...v, validationStatus: s }))}
                className="mt-1 size-4 accent-brand-blue-text"
              />
              <span>
                <span className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                  {CLIENT_VALIDATION_STATUS[s].label}
                </span>
                <span className="block text-[0.8125rem] text-muted">{VALIDATION_EFFECT[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field
          label={`Niveau de confiance : ${values.trustLevel} / 100`}
          hint="Information interne pour l'équipe de modération."
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={values.trustLevel}
            onChange={(e) => setValues((v) => ({ ...v, trustLevel: Number(e.target.value) }))}
            className="w-full accent-brand-blue-text"
          />
        </Field>
        <Field
          label="Notes internes"
          hint={`${NOTES_MAX} caractères maximum. Non visibles par l'annonceur.`}
        >
          <Textarea
            rows={3}
            maxLength={NOTES_MAX}
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          />
        </Field>
      </form>
    </DialogContent>
  );
}

async function loadUserDetail(userId: number, signal: AbortSignal) {
  const [account, sessions, history] = await Promise.all([
    adminUsersApi.get(userId, { signal }),
    adminUsersApi.sessions(userId, { signal }).catch(() => []),
    adminUsersApi.loginHistory(userId, { signal }).catch(() => []),
  ]);
  return { account, sessions, history };
}

function UserDetailDialog({
  userId,
  canAct,
  currentUserId,
  onUpdated,
  onOpenChange,
}: {
  userId: number | null;
  canAct: boolean;
  currentUserId: number;
  onUpdated: (u: AdminUserResponse) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      {userId !== null ? (
        <UserDetail
          key={userId}
          userId={userId}
          canAct={canAct}
          currentUserId={currentUserId}
          onUpdated={onUpdated}
        />
      ) : null}
    </Dialog>
  );
}

type SecurityAction = "reset-2fa" | "require-password" | "reset-password";

const SECURITY_ACTION_COPY: Record<
  SecurityAction,
  { title: (name: string) => string; description: string; confirmLabel: string; toast: string }
> = {
  "reset-2fa": {
    title: (name) => `Réinitialiser la double authentification de ${name} ?`,
    description:
      "Son application et ses codes de secours ne fonctionneront plus et ses sessions sont fermées. Si son rôle l'impose, une nouvelle activation lui sera demandée à la prochaine connexion.",
    confirmLabel: "Réinitialiser",
    toast: "Double authentification réinitialisée",
  },
  "require-password": {
    title: (name) => `Exiger un nouveau mot de passe de ${name} ?`,
    description:
      "Ses sessions sont fermées. À sa prochaine connexion, la personne devra définir un nouveau mot de passe avant de continuer.",
    confirmLabel: "Exiger le changement",
    toast: "Nouveau mot de passe exigé",
  },
  "reset-password": {
    title: (name) => `Réinitialiser le mot de passe de ${name} ?`,
    description:
      "Son mot de passe actuel est remplacé par un mot de passe temporaire affiché une seule fois, et ses sessions sont fermées. La personne devra en choisir un nouveau à la connexion suivante.",
    confirmLabel: "Réinitialiser le mot de passe",
    toast: "Mot de passe réinitialisé",
  },
};

function UserDetail({
  userId,
  canAct,
  currentUserId,
  onUpdated,
}: {
  userId: number;
  canAct: boolean;
  currentUserId: number;
  onUpdated: (u: AdminUserResponse) => void;
}) {
  const { toast } = useToast();
  const detail = useResource(`admin:user:${userId}`, (signal) => loadUserDetail(userId, signal));
  const [revoking, setRevoking] = useState(false);
  const [securityAction, setSecurityAction] = useState<SecurityAction | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const account = detail.data?.account;

  const revoke = async () => {
    if (revoking) return;
    setRevoking(true);
    try {
      const { revoked } = await adminUsersApi.revokeSessions(userId);
      toast({
        title: `${revoked} session${revoked > 1 ? "s" : ""} révoquée${revoked > 1 ? "s" : ""}`,
        variant: "success",
      });
      detail.reload();
    } catch (e) {
      toast({
        title: "Révocation impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <DialogContent
      size="lg"
      title={account ? accountTitle(account) : "Compte"}
      description={account?.email}
    >
      {detail.data && account ? (
        <div className="flex flex-col gap-6">
          <FactList
            columns={3}
            items={[
              { label: "Rôle", value: ROLE_LABEL[account.role] },
              { label: "Compte", value: account.isActive ? "Actif" : "Désactivé" },
              {
                label: "Double authentification",
                value: account.twoFactorEnabled
                  ? account.twoFactorRequired
                    ? "Active (obligatoire)"
                    : "Active"
                  : account.twoFactorRequired
                    ? "Inactive (obligatoire à la prochaine connexion)"
                    : "Inactive",
              },
              {
                label: "Mot de passe",
                value: account.mustChangePassword ? "Changement requis" : "—",
              },
              {
                label: "Validation",
                value: account.client
                  ? CLIENT_VALIDATION_STATUS[account.client.validationStatus].label
                  : "—",
              },
              { label: "Nom", value: account.nom },
              { label: "Société", value: account.societe ?? account.client?.companyName ?? "—" },
              { label: "Téléphone", value: account.telephone ?? "—" },
              { label: "Adresse", value: account.adresse ?? "—", wide: true },
              { label: "Inscrit le", value: formatDateTime(account.createdAt) },
              {
                label: "Dernière connexion",
                value: account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Jamais",
              },
              {
                label: "Confiance",
                value: account.client ? `${formatNumber(account.client.trustLevel)} / 100` : "—",
              },
            ]}
          />
          {account.clientNotes ? (
            <Alert tone="info" title="Notes internes" live="none">
              <span className="whitespace-pre-line">{account.clientNotes}</span>
            </Alert>
          ) : null}

          {canAct ? (
            <section aria-labelledby={`securite-${userId}`}>
              <h3
                id={`securite-${userId}`}
                className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
              >
                <ShieldCheck aria-hidden="true" className="size-4.5 text-brand-blue-text" />
                Sécurité du compte
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabledReason={twoFactorResetBlocker(account, currentUserId)}
                  onClick={() => setSecurityAction("reset-2fa")}
                >
                  Réinitialiser la double authentification
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabledReason={passwordChangeBlocker(account, currentUserId)}
                  onClick={() => setSecurityAction("require-password")}
                >
                  Exiger un nouveau mot de passe
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabledReason={passwordResetBlocker(account, currentUserId)}
                  onClick={() => setSecurityAction("reset-password")}
                >
                  Réinitialiser le mot de passe
                </Button>
              </div>
              {temporaryPassword ? (
                <Alert
                  tone="warning"
                  live="status"
                  title="Mot de passe temporaire — affiché une seule fois"
                  className="mt-3"
                >
                  <p>
                    Transmettez-le à {accountTitle(account)} par un canal sûr. Un nouveau mot de
                    passe lui sera demandé dès sa prochaine connexion.
                  </p>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="min-w-0 flex-1 rounded-control border border-line bg-overlay-inset px-3 py-2 font-mono text-[0.8125rem] break-all text-ink-strong">
                      {temporaryPassword}
                    </code>
                    <CopyButton value={temporaryPassword} label="Copier le mot de passe" />
                  </div>
                </Alert>
              ) : null}
              <ConfirmDialog
                open={securityAction !== null}
                onOpenChange={(open) => {
                  if (!open) setSecurityAction(null);
                }}
                title={SECURITY_ACTION_COPY[securityAction ?? "reset-2fa"].title(
                  accountTitle(account),
                )}
                description={SECURITY_ACTION_COPY[securityAction ?? "reset-2fa"].description}
                confirmLabel={SECURITY_ACTION_COPY[securityAction ?? "reset-2fa"].confirmLabel}
                onConfirm={async () => {
                  const action = securityAction ?? "reset-2fa";
                  if (action === "reset-password") {
                    const issued = await adminUsersApi.resetPassword(userId);
                    setTemporaryPassword(issued.temporaryPassword);
                  } else {
                    const updated =
                      action === "reset-2fa"
                        ? await adminUsersApi.resetTwoFactor(userId)
                        : await adminUsersApi.requirePasswordChange(userId);
                    onUpdated(updated);
                  }
                  detail.reload();
                  toast({ title: SECURITY_ACTION_COPY[action].toast, variant: "success" });
                }}
              />
            </section>
          ) : null}

          <section aria-labelledby={`sessions-${userId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id={`sessions-${userId}`}
                className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
              >
                <BadgeCheck aria-hidden="true" className="size-4.5 text-brand-blue-text" />
                Sessions actives ({detail.data.sessions.length})
              </h3>
              {canAct && detail.data.sessions.length > 0 ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={revoking}
                  loadingLabel="Révocation"
                  onClick={() => void revoke()}
                >
                  Révoquer les sessions
                </Button>
              ) : null}
            </div>
            {detail.data.sessions.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucune session ouverte.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line">
                {detail.data.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="text-ink-soft">
                      {deviceLabel(s.userAgent)}
                      <span className="text-muted"> · {s.ipAddress ?? "IP inconnue"}</span>
                    </span>
                    <span className="text-[0.8125rem] text-muted">
                      Active {formatRelative(s.lastSeenAt)} · expire le{" "}
                      {formatDateTime(s.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby={`connexions-${userId}`}>
            <h3
              id={`connexions-${userId}`}
              className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
            >
              <UserRound aria-hidden="true" className="size-4.5 text-brand-blue-text" />
              Historique des connexions
            </h3>
            {detail.data.history.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucune tentative de connexion enregistrée.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line rounded-card border border-line">
                {detail.data.history.slice(0, 20).map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Badge tone={h.success ? "success" : "danger"} size="sm">
                        {h.success
                          ? "Réussie"
                          : h.failureReason
                            ? LOGIN_FAILURE_LABEL[h.failureReason]
                            : "Échec"}
                      </Badge>
                      <span className="text-ink-soft">{deviceLabel(h.userAgent)}</span>
                    </span>
                    <span className="text-[0.8125rem] text-muted tabular">
                      {h.ipAddress ?? "IP inconnue"} · {formatDateTime(h.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} scope="section" />
      ) : (
        <LoadingRegion label="Chargement du compte…" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </LoadingRegion>
      )}
    </DialogContent>
  );
}
