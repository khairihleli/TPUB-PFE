import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mine: vi.fn(),
  byCampaign: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  params: { value: "" },
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { mine: mocks.mine },
  reservationsApi: { byCampaign: mocks.byCampaign },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params.value),
  usePathname: () => "/espace/campagnes",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

import { CampaignList } from "@/components/campaign/campaign-list";
import { CampaignNotFound } from "@/components/campaign/campaign-ui";
import { ReservationList } from "@/components/campaign/reservation-list";
import type { CampaignResponse } from "@/lib/api/types";
import { todayISO } from "@/lib/format";
import { clearResourceCache } from "@/lib/resource-cache";

function campaign(partial: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 1,
    clientId: 1,
    name: "Campagne",
    objective: "Objectif de test suffisamment long",
    budget: 1000,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

/** Adds `days` to today's Tunis date. */
function isoInDays(days: number): string {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
  mocks.params.value = "";
  mocks.byCampaign.mockResolvedValue([]);
});

describe("CampaignList", () => {
  it("shows the empty state with one clear action", async () => {
    mocks.mine.mockResolvedValue([]);
    render(<CampaignList />);
    expect(await screen.findByText("Aucune campagne pour l'instant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer une campagne" })).toHaveAttribute(
      "href",
      "/espace/campagnes/nouvelle",
    );
  });

  it("filters by status tab and searches by name", async () => {
    const user = userEvent.setup();
    mocks.mine.mockResolvedValue([
      campaign({ id: 1, name: "Été à La Marsa", status: "BROUILLON" }),
      campaign({ id: 2, name: "Soldes d'hiver", status: "REJECTED_BY_AI" }),
      campaign({
        id: 3,
        name: "Festival",
        status: "ACTIVE",
        startDate: "2020-01-01",
        endDate: "2099-01-01",
      }),
      campaign({ id: 4, name: "Marché", status: "BLOCKED" }),
    ]);
    render(<CampaignList />);

    expect(await screen.findByRole("link", { name: "Été à La Marsa" })).toHaveAttribute(
      "href",
      "/espace/campagnes/1",
    );
    expect(screen.getAllByRole("article")).toHaveLength(4);

    await user.click(screen.getByRole("tab", { name: /À finaliser/ }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes?statut=a-finaliser", {
      scroll: false,
    });

    await user.click(screen.getByRole("tab", { name: /Terminées & refusées/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Marché" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Toutes/ }));
    await user.type(screen.getByRole("searchbox", { name: /Rechercher/ }), "ete");
    expect(screen.getAllByRole("article")).toHaveLength(1);

    await user.clear(screen.getByRole("searchbox", { name: /Rechercher/ }));
    await user.type(screen.getByRole("searchbox", { name: /Rechercher/ }), "zzz");
    expect(screen.getByText("Aucun résultat pour ces filtres")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réinitialiser les filtres" })).toBeInTheDocument();
  });

  it("puts a future ACTIVE campaign in « Validées », labelled « Programmée » for advertisers", async () => {
    const user = userEvent.setup();
    mocks.mine.mockResolvedValue([
      campaign({
        id: 5,
        name: "Rentrée scolaire",
        status: "ACTIVE",
        startDate: isoInDays(5),
        endDate: isoInDays(20),
        submittedAt: "2026-09-01T10:00:00Z",
        validatedAt: "2026-09-02T10:00:00Z",
      }),
      campaign({ id: 6, name: "Brouillon", status: "BROUILLON" }),
    ]);
    render(<CampaignList />);

    await user.click(await screen.findByRole("tab", { name: /Validées/ }));
    const rows = screen.getAllByRole("article");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Programmée")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Diffusion dans 5 jours")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /En diffusion/ })).not.toBeInTheDocument();
  });

  it("maps a legacy ?statut= value to the new tab", async () => {
    mocks.params.value = "statut=refusees";
    mocks.mine.mockResolvedValue([
      campaign({ id: 2, name: "Soldes", status: "REJECTED_BY_AI" }),
      campaign({ id: 4, name: "Marché", status: "BLOCKED" }),
    ]);
    render(<CampaignList />);
    expect(await screen.findByRole("tab", { name: /Terminées & refusées/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("sorts from ?tri= and offers « Finaliser » on drafts, towards the right wizard step", async () => {
    mocks.params.value = "tri=nom";
    mocks.mine.mockResolvedValue([
      campaign({ id: 1, name: "Zèbre", status: "BROUILLON", reservationsCount: 1 }),
      campaign({ id: 2, name: "Abeille", status: "BROUILLON", reservationsCount: 0 }),
      campaign({
        id: 3,
        name: "Mouette",
        status: "REVIEW_REQUIRED",
        submittedAt: "2026-09-01T10:00:00Z",
      }),
    ]);
    render(<CampaignList />);

    await screen.findByRole("link", { name: "Zèbre" });
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Abeille", "Mouette", "Zèbre"]);

    // The draft with a reservation goes to Vérification, the other one to Contenu.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Finaliser.*Zèbre/ })).toHaveAttribute(
        "href",
        "/espace/campagnes/nouvelle?id=1&etape=4",
      ),
    );
    expect(screen.getByRole("link", { name: /Finaliser.*Abeille/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/nouvelle?id=2&etape=2",
    );
    expect(screen.getByText("1 Porteur réservé")).toBeInTheDocument();
    expect(screen.getAllByText("Aucun Porteur réservé")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Finaliser.*Mouette/ })).not.toBeInTheDocument();
    // advertiser wording
    expect(screen.getByText("En examen ZELQANE")).toBeInTheDocument();
  });
});

describe("ReservationList (IA-06, IA-13)", () => {
  it("links Porteurs to the Studio 3D and zones to the map, with glossary labels", () => {
    render(
      <ReservationList
        longStatus
        reservations={[
          {
            id: 1,
            campaignId: 7,
            zoneId: 3,
            supportId: 12,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
            startTime: "08:00:00",
            endTime: "22:00:00",
            availabilityStatus: "RESERVE",
            reservationStatus: "TEMPORAIRE",
            estimatedViews: 1000,
            estimatedCost: 250,
            supportName: "Totem Lac 2",
            zoneName: "Les Berges du Lac",
            supportType: "ECRAN",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Totem Lac 2" })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=12",
    );
    expect(screen.getByRole("link", { name: /Voir en 3D.*Totem Lac 2/ })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=12",
    );
    expect(screen.getByRole("link", { name: /Les Berges du Lac/ })).toHaveAttribute(
      "href",
      "/espace/reseau?zone=3",
    );
    expect(screen.getByText("Bloqué · en attente de décision ZELQANE")).toBeInTheDocument();
  });

  it("renders plain names when links are off", () => {
    render(
      <ReservationList
        links={false}
        reservations={[
          {
            id: 1,
            campaignId: 7,
            zoneId: 3,
            supportId: 12,
            startDate: "2026-10-01",
            endDate: "2026-10-31",
            startTime: null as unknown as string,
            endTime: null as unknown as string,
            availabilityStatus: "RESERVE",
            reservationStatus: "CONFIRMEE",
            estimatedViews: 1000,
            estimatedCost: 250,
            supportName: "Totem Lac 2",
            zoneName: "Les Berges du Lac",
            supportType: null,
          },
        ]}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Confirmé")).toBeInTheDocument();
  });
});

describe("CampaignNotFound", () => {
  it("offers recent campaigns and the search", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <CampaignNotFound
        showTitle={false}
        onSearch={onSearch}
        recent={[campaign({ id: 9, name: "Ouverture La Marsa" })]}
      />,
    );
    expect(
      screen.getByText("Cette campagne n'existe pas ou n'appartient pas à votre espace."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouverture La Marsa" })).toHaveAttribute(
      "href",
      "/espace/campagnes/9",
    );
    await user.click(screen.getByRole("button", { name: /Rechercher/ }));
    expect(onSearch).toHaveBeenCalled();
  });
});
