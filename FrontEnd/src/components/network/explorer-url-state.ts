/**
 * URL state of the network explorer (`/espace/reseau`), shareable and pure.
 * - `?zone=<id>`      zone highlighted / framed on the map
 * - `?porteur=<id>`   Studio 3D sheet open on that Porteur
 * - `?vue=3d`         map in 3D (default 2D, omitted)
 * - `?fond=clair|satellite` basemap (default « sombre », omitted)
 * - `?repere=1`       calibration overlay passed through to the studio (never written by the UI)
 * - `?regrouper=1`    « Regrouper les Porteurs proches » (off by default: every Porteur shown)
 * Unknown params are preserved when the state is written back.
 */
import { isBasemapId, type BasemapId, type ViewMode } from "@/lib/network/map-style";
import { routes } from "@/lib/routes";

export interface ExplorerUrlState {
  zoneId: number | null;
  porteurId: number | null;
  view: ViewMode;
  basemap: BasemapId;
  repere: boolean;
  /** Group nearby Porteurs into count bubbles (opt-in). */
  regrouper: boolean;
}

export const DEFAULT_EXPLORER_URL_STATE: ExplorerUrlState = Object.freeze({
  zoneId: null,
  porteurId: null,
  view: "2d",
  basemap: "sombre",
  repere: false,
  regrouper: false,
});

export const EXPLORER_PARAM = {
  zone: "zone",
  porteur: "porteur",
  view: "vue",
  basemap: "fond",
  repere: "repere",
  regrouper: "regrouper",
} as const;

/** Anything with `get(name)` (URLSearchParams, ReadonlyURLSearchParams). */
export interface ParamReader {
  get: (name: string) => string | null;
}

/** "12" → 12 ; "", "0", "-3", "1.5", "12abc", huge → null. */
export function parseIdParam(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** `?vue=3d` (case-insensitive) → "3d", anything else → "2d". */
export function parseViewParam(raw: string | null | undefined): ViewMode {
  return raw?.trim().toLowerCase() === "3d" ? "3d" : "2d";
}

/** `?fond=satellite` → "satellite" ; unknown → "sombre". */
export function parseBasemapParam(raw: string | null | undefined): BasemapId {
  const v = raw?.trim().toLowerCase();
  return isBasemapId(v) ? v : "sombre";
}

/** `?repere=1|true|oui|on` → true (same rule as the studio's parseRepereParam). */
export function parseRepereFlag(raw: string | null | undefined): boolean {
  return typeof raw === "string" && ["1", "true", "oui", "on"].includes(raw.trim().toLowerCase());
}

export function parseExplorerUrlState(params: ParamReader): ExplorerUrlState {
  return {
    zoneId: parseIdParam(params.get(EXPLORER_PARAM.zone)),
    porteurId: parseIdParam(params.get(EXPLORER_PARAM.porteur)),
    view: parseViewParam(params.get(EXPLORER_PARAM.view)),
    basemap: parseBasemapParam(params.get(EXPLORER_PARAM.basemap)),
    repere: parseRepereFlag(params.get(EXPLORER_PARAM.repere)),
    regrouper: parseRepereFlag(params.get(EXPLORER_PARAM.regrouper)),
  };
}

/**
 * Applies `patch` onto the current query string and returns the new one (without « ? »).
 * Defaults are removed so the canonical URL stays short; unrelated params are kept in place.
 */
export function buildExplorerQuery(
  current: string | URLSearchParams,
  patch: Partial<ExplorerUrlState>,
): string {
  const params = new URLSearchParams(
    typeof current === "string" ? current.replace(/^\?/, "") : current.toString(),
  );
  const write = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
  };
  if ("zoneId" in patch) {
    write(EXPLORER_PARAM.zone, patch.zoneId == null ? null : String(patch.zoneId));
  }
  if ("porteurId" in patch) {
    write(EXPLORER_PARAM.porteur, patch.porteurId == null ? null : String(patch.porteurId));
  }
  if (patch.view !== undefined) write(EXPLORER_PARAM.view, patch.view === "3d" ? "3d" : null);
  if (patch.basemap !== undefined) {
    write(EXPLORER_PARAM.basemap, patch.basemap === "sombre" ? null : patch.basemap);
  }
  if (patch.repere !== undefined) write(EXPLORER_PARAM.repere, patch.repere ? "1" : null);
  if (patch.regrouper !== undefined) {
    write(EXPLORER_PARAM.regrouper, patch.regrouper ? "1" : null);
  }
  return params.toString();
}

/** How a URL write reaches the browser history (IA-08). */
export type ExplorerHistoryMethod = "push" | "replace" | "back";

/**
 * History policy of the explorer:
 * - opening the Studio (`porteur` null → id) pushes an entry, so Back closes it;
 * - closing a Studio opened in this session goes back to that entry (no forward-stack clutter);
 * - everything else (switching Porteur, deep-link close, map params) replaces.
 * Closing uses « back » only when `porteur` is the only param that changes.
 */
export function explorerHistoryMethod(
  current: string | URLSearchParams,
  patch: Partial<ExplorerUrlState>,
  { openedInSession }: { openedInSession: boolean },
): ExplorerHistoryMethod {
  if (!("porteurId" in patch)) return "replace";
  const params = new URLSearchParams(
    typeof current === "string" ? current.replace(/^\?/, "") : current.toString(),
  );
  const before = parseIdParam(params.get(EXPLORER_PARAM.porteur));
  const after = patch.porteurId ?? null;
  if (before === null && after !== null) return "push";
  if (before !== null && after === null && openedInSession) {
    const onlyClose =
      buildExplorerQuery(params, patch) === buildExplorerQuery(params, { porteurId: null });
    return onlyClose ? "back" : "replace";
  }
  return "replace";
}

/** `/espace/reseau?porteur=6` style href. */
export function explorerHref(
  pathname: string,
  current: string | URLSearchParams,
  patch: Partial<ExplorerUrlState>,
): string {
  const qs = buildExplorerQuery(current, patch);
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Deep link to a Porteur in the explorer (used by other pages). */
export function porteurHref(supportId: number): string {
  return routes.espace.network({ porteur: supportId });
}
