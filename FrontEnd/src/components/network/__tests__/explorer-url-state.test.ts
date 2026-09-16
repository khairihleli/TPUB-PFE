import { describe, expect, it } from "vitest";

import {
  buildExplorerQuery,
  DEFAULT_EXPLORER_URL_STATE,
  explorerHistoryMethod,
  explorerHref,
  parseBasemapParam,
  parseExplorerUrlState,
  parseIdParam,
  parseRepereFlag,
  parseViewParam,
  porteurHref,
} from "@/components/network/explorer-url-state";
import { routes } from "@/lib/routes";

const parse = (qs: string) => parseExplorerUrlState(new URLSearchParams(qs));

describe("parseExplorerUrlState", () => {
  it("returns the defaults for an empty query", () => {
    expect(parse("")).toEqual(DEFAULT_EXPLORER_URL_STATE);
  });

  it("reads zone, porteur, vue, fond, repere and regrouper", () => {
    expect(parse("?zone=3&porteur=12&vue=3d&fond=satellite&repere=1&regrouper=1")).toEqual({
      zoneId: 3,
      porteurId: 12,
      view: "3d",
      basemap: "satellite",
      repere: true,
      regrouper: true,
    });
  });

  it("shows every Porteur by default: grouping only with ?regrouper=1", () => {
    expect(DEFAULT_EXPLORER_URL_STATE.regrouper).toBe(false);
    expect(parse("?regrouper=0").regrouper).toBe(false);
    expect(buildExplorerQuery("zone=2", { regrouper: true })).toBe("zone=2&regrouper=1");
    expect(buildExplorerQuery("zone=2&regrouper=1", { regrouper: false })).toBe("zone=2");
  });

  it("is strict about ids and tolerant about case", () => {
    for (const raw of ["", "0", "-2", "1.5", "12abc", "abc", "9999999999999999"]) {
      expect(parseIdParam(raw)).toBeNull();
    }
    expect(parseIdParam(" 7 ")).toBe(7);
    expect(parseViewParam("3D")).toBe("3d");
    expect(parseViewParam("2d")).toBe("2d");
    expect(parseViewParam("globe")).toBe("2d");
    expect(parseBasemapParam("Clair")).toBe("clair");
    expect(parseBasemapParam("osm")).toBe("sombre");
    expect(parseRepereFlag("oui")).toBe(true);
    expect(parseRepereFlag("0")).toBe(false);
    expect(parseRepereFlag(null)).toBe(false);
  });
});

describe("buildExplorerQuery", () => {
  it("writes non-default values and removes defaults", () => {
    expect(buildExplorerQuery("", { porteurId: 6, view: "3d", basemap: "clair" })).toBe(
      "porteur=6&vue=3d&fond=clair",
    );
    expect(
      buildExplorerQuery("?porteur=6&vue=3d&fond=clair", {
        porteurId: null,
        view: "2d",
        basemap: "sombre",
      }),
    ).toBe("");
  });

  it("keeps unrelated params (repere, utm…) and untouched keys", () => {
    expect(buildExplorerQuery("repere=1&zone=2&utm=x", { porteurId: 9 })).toBe(
      "repere=1&zone=2&utm=x&porteur=9",
    );
    expect(buildExplorerQuery(new URLSearchParams("zone=2"), { zoneId: 4 })).toBe("zone=4");
  });

  it("round-trips", () => {
    const state = {
      zoneId: 1,
      porteurId: 8,
      view: "3d",
      basemap: "satellite",
      repere: true,
      regrouper: true,
    } as const;
    expect(parse(buildExplorerQuery("", state))).toEqual(state);
  });

  it("builds hrefs (routes contract)", () => {
    expect(explorerHref("/espace/reseau", "", {})).toBe("/espace/reseau");
    expect(explorerHref("/espace/reseau", "fond=clair", { zoneId: 3 })).toBe(
      "/espace/reseau?fond=clair&zone=3",
    );
    expect(porteurHref(6)).toBe("/espace/reseau?porteur=6");
    expect(porteurHref(6)).toBe(routes.espace.network({ porteur: 6 }));
  });
});

describe("explorerHistoryMethod (IA-08)", () => {
  const fresh = { openedInSession: false };
  const opened = { openedInSession: true };

  it("pushes when the Studio opens from the map", () => {
    expect(explorerHistoryMethod("", { porteurId: 6 }, fresh)).toBe("push");
    expect(explorerHistoryMethod("?fond=clair&zone=2", { porteurId: 6 }, fresh)).toBe("push");
  });

  it("goes back when closing a Studio opened in this session", () => {
    expect(explorerHistoryMethod("porteur=6", { porteurId: null }, opened)).toBe("back");
    expect(explorerHistoryMethod("fond=clair&porteur=6", { porteurId: null }, opened)).toBe("back");
  });

  it("replaces when closing a deep-linked Studio", () => {
    expect(explorerHistoryMethod("porteur=6&vue=3d", { porteurId: null }, fresh)).toBe("replace");
  });

  it("replaces when closing also changes other params", () => {
    expect(explorerHistoryMethod("porteur=6", { porteurId: null, zoneId: 3 }, opened)).toBe(
      "replace",
    );
  });

  it("replaces for Porteur switches and map params", () => {
    expect(explorerHistoryMethod("porteur=6", { porteurId: 7 }, opened)).toBe("replace");
    expect(explorerHistoryMethod("porteur=6", { basemap: "satellite" }, opened)).toBe("replace");
    expect(explorerHistoryMethod("", { zoneId: 2 }, fresh)).toBe("replace");
    expect(explorerHistoryMethod("", { porteurId: null }, opened)).toBe("replace");
  });
});
