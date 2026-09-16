import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/espace/campagnes/7",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { BreadcrumbProvider, useTrail } from "@/components/shell/breadcrumbs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ui/error-state";
import { ErrorSummary } from "@/components/ui/error-summary";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { Field, Input } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { LoadingRegion, SLOW_CAPTION } from "@/components/ui/loading-region";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNotice } from "@/components/ui/partial-notice";
import { SectionCard } from "@/components/ui/section-card";
import { TOAST_VIEWPORT_CLASS } from "@/components/ui/toast";
import { ApiTransportError } from "@/lib/api/errors";

afterEach(() => {
  vi.useRealTimers();
});

describe("DialogContent dirty", () => {
  function Harness({ onDiscard }: { onDiscard?: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Modifier la zone"
          dirty
          onDiscard={onDiscard}
          footer={
            <DialogClose asChild>
              <button type="button">Annuler</button>
            </DialogClose>
          }
        >
          <p>Formulaire</p>
        </DialogContent>
      </Dialog>
    );
  }

  it("shows the inline discard confirmation on Escape instead of closing", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<Harness onDiscard={onDiscard} />);
    const dialog = screen.getByRole("dialog", { name: "Modifier la zone" });
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Modifier la zone" })).toBeInTheDocument();
    const bar = within(dialog).getByRole("alertdialog", { name: "Abandonner les modifications ?" });
    expect(within(bar).getByRole("button", { name: "Garder" })).toHaveFocus();
    await user.click(within(bar).getByRole("button", { name: "Garder" }));
    expect(within(dialog).queryByRole("alertdialog")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    await user.click(within(dialog).getByRole("button", { name: "Abandonner" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Toast placement (FFA-11)", () => {
  it("anchors at the top below the topbar on mobile and above sticky bars from sm", () => {
    expect(TOAST_VIEWPORT_CLASS).toContain("top-[calc(var(--topbar-h)+0.5rem)]");
    expect(TOAST_VIEWPORT_CLASS).toContain(
      "sm:bottom-[calc(1rem+var(--toast-offset)+var(--bottom-bar-h))]",
    );
    expect(TOAST_VIEWPORT_CLASS).not.toContain("backdrop");
  });
});

describe("PageHeader", () => {
  function TrailProbe() {
    return (
      <output data-testid="trail">
        {useTrail()
          .map((b) => b.label)
          .join(" › ")}
      </output>
    );
  }

  it("renders the trail inline outside AppShell", () => {
    render(
      <PageHeader
        title="Ouverture"
        breadcrumbs={[{ label: "Campagnes", href: "/espace/campagnes" }, { label: "Ouverture" }]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Fil d'Ariane" })).toBeInTheDocument();
  });

  it("registers the trail into the topbar inside AppShell and renders none in main", () => {
    render(
      <BreadcrumbProvider pathname="/espace/campagnes/7" section="espace">
        <TrailProbe />
        <main>
          <PageHeader
            title="Ouverture La Marsa"
            breadcrumbs={[
              { label: "Campagnes", href: "/espace/campagnes" },
              { label: "Ouverture La Marsa" },
            ]}
          />
        </main>
      </BreadcrumbProvider>,
    );
    expect(screen.getByTestId("trail")).toHaveTextContent("Campagnes › Ouverture La Marsa");
    expect(within(screen.getByRole("main")).queryByRole("navigation")).toBeNull();
  });

  it("orders actions primary → secondary → overflow with destructive last", async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(
      <PageHeader
        title="Brouillon"
        meta={<span>Brouillon</span>}
        primaryAction={<button type="button">Finaliser</button>}
        secondaryActions={<button type="button">Modifier les détails</button>}
        overflowActions={[
          { label: "Supprimer", tone: "danger", onSelect: remove },
          { label: "Dupliquer", onSelect: vi.fn() },
        ]}
      />,
    );
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons).toEqual(["Finaliser", "Modifier les détails", "Plus d'actions"]);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.nextElementSibling).toHaveTextContent("Brouillon");
    await user.click(screen.getByRole("button", { name: "Plus d'actions" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Dupliquer", "Supprimer"]);
    await user.click(items[1]!);
    expect(remove).toHaveBeenCalled();
  });
});

describe("DropdownMenu", () => {
  it("renders external links in a new tab", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button type="button">Menu</button>}
        items={[{ label: "Voir le site TPUB", href: "/", external: true }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const link = await screen.findByRole("menuitem", { name: /Voir le site TPUB/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("DataTable sorting", () => {
  interface Row {
    id: number;
    name: string;
    cost: number | null;
  }
  const rows: Row[] = [
    { id: 1, name: "Bardo", cost: 120 },
    { id: 2, name: "Ariana", cost: null },
    { id: 3, name: "Carthage", cost: 40 },
  ];
  const columns: DataTableColumn<Row>[] = [
    {
      key: "nom",
      header: "Porteur",
      cell: (r) => r.name,
      sortable: true,
      sortValue: (r) => r.name,
      primary: true,
    },
    {
      key: "cout",
      header: "Coût",
      cell: (r) => r.cost ?? "—",
      sortable: true,
      sortValue: (r) => r.cost,
      nowrap: true,
      mobileMeta: true,
    },
  ];

  it("sorts uncontrolled with aria-sort and keeps missing values last", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Réservations"
        rowActions={(r) => <a href={`#${r.id}`}>Voir</a>}
      />,
    );
    const table = screen.getByRole("table", { name: "Réservations" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers[0]).toHaveAttribute("aria-sort", "none");
    await user.click(within(headers[1]!).getByRole("button", { name: /Coût/ }));
    expect(headers[1]).toHaveAttribute("aria-sort", "ascending");
    const names = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.firstElementChild?.textContent);
    expect(names()).toEqual(["Carthage", "Bardo", "Ariana"]);
    await user.click(within(headers[1]!).getByRole("button", { name: /Coût/ }));
    expect(headers[1]).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual(["Bardo", "Carthage", "Ariana"]);
    expect(within(table).getAllByRole("link", { name: "Voir" })).toHaveLength(3);
  });

  it("controlled sort calls onSortChange and shows the caption; emptyFiltered wins", () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Réservations"
        sort={{ key: "nom", dir: "asc" }}
        onSortChange={onSortChange}
        sortCaption="début croissant"
      />,
    );
    expect(screen.getByText("Trié par : début croissant")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Porteur/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "nom", dir: "desc" });
    rerender(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        caption="Réservations"
        empty={<p>Première utilisation</p>}
        emptyFiltered={<p>Aucun résultat pour ces filtres</p>}
      />,
    );
    expect(screen.getByText("Aucun résultat pour ces filtres")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("LoadingRegion shows the slow caption at 4 s and « Réessayer » at 8 s", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    render(
      <LoadingRegion label="Chargement des campagnes…" onRetry={onRetry}>
        <span>squelette</span>
      </LoadingRegion>,
    );
    expect(screen.queryByText(SLOW_CAPTION)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText(SLOW_CAPTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("ErrorState renders the slow category without offline wording, with digest", () => {
    render(
      <ErrorState
        error={new ApiTransportError("timeout")}
        scope="section"
        digest="abc123"
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Le service met trop de temps à répondre")).toBeInTheDocument();
    expect(screen.queryByText(/connexion/i)).toBeNull();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("PartialNotice offers a retry", () => {
    const onRetry = vi.fn();
    render(<PartialNotice onRetry={onRetry} />);
    expect(screen.getByText("Données partielles")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("ErrorSummary focuses itself and links to fields", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ErrorSummary
          errors={[
            { fieldId: "nom", message: "Indiquez un nom." },
            { fieldId: "budget", message: "Indiquez un budget." },
          ]}
        />
        <Field label="Nom" id="nom" error="Indiquez un nom.">
          <Input />
        </Field>
        <Field label="Budget" id="budget" error="Indiquez un budget.">
          <Input />
        </Field>
      </>,
    );
    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    expect(within(summary).getByText("2 champs à corriger")).toBeInTheDocument();
    await user.click(within(summary).getByRole("link", { name: "Indiquez un budget." }));
    expect(screen.getByLabelText("Budget")).toHaveFocus();
  });

  it("SectionCard labels its section and EstimateTag stays neutral", () => {
    render(
      <SectionCard title="Créneaux" description="Porteurs réservés" aside={<EstimateTag />}>
        contenu
      </SectionCard>,
    );
    expect(screen.getByRole("region", { name: "Créneaux" })).toBeInTheDocument();
    const tag = screen.getByText("Estimation");
    expect(tag.className).not.toContain("warning");
    expect(
      screen.getByRole("button", { name: /À propos de cette estimation/ }),
    ).toBeInTheDocument();
  });
});

describe("FilterBar", () => {
  it("shows the count, reset, and « Filtres (n) » sheet", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onSearch = vi.fn();
    render(
      <FilterBar
        search={{ value: "bardo", onChange: onSearch, placeholder: "Rechercher un Porteur" }}
        activeCount={2}
        onReset={onReset}
        resultCount="12 réservations"
      >
        <label>
          Statut
          <select defaultValue="TEMPORAIRE">
            <option value="TEMPORAIRE">Bloqué</option>
          </select>
        </label>
      </FilterBar>,
    );
    expect(screen.getByText("12 réservations")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Réinitialiser" })[0]!);
    expect(onReset).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Filtres (2)" }));
    expect(await screen.findByRole("dialog", { name: "Filtres" })).toBeInTheDocument();
  });

  it("takes « / » to focus its search", async () => {
    const user = userEvent.setup();
    const { focusPageSearch } = await import("@/lib/shortcuts");
    render(
      <FilterBar search={{ value: "", onChange: vi.fn() }} activeCount={0} onReset={vi.fn()} />,
    );
    act(() => {
      expect(focusPageSearch()).toBe(true);
    });
    expect(screen.getByRole("searchbox", { name: "Rechercher" })).toHaveFocus();
    await user.keyboard("{Escape}");
  });
});
