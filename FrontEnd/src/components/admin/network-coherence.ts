/**
 * « Contrôle de cohérence » of the network (NETWORK-MAP-SPEC §7). Pure rules over the zones and
 * supports already loaded by /admin/reseau — nothing is fetched, nothing is guessed: every issue
 * points to one zone or one Porteur with « Localiser » and « Corriger » actions in the UI.
 */
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { formatDistance, haversineDistance, suggestZoneForPoint } from "@/lib/network/geo";
import { resolvePorteurType } from "@/lib/network/porteur";

export type CoherenceRuleId =
  | "type-d-ecran"
  | "hors-rayon"
  | "zone-inactive-porteurs-actifs"
  | "declaration-incomplete"
  | "zone-vide";

export type CoherenceSeverity = "danger" | "warning" | "info";

export interface CoherenceRule {
  id: CoherenceRuleId;
  title: string;
  description: string;
  severity: CoherenceSeverity;
}

/** Display order = severity order. */
export const COHERENCE_RULES: readonly CoherenceRule[] = [
  {
    id: "type-d-ecran",
    title: "Type D déclaré comme écran",
    description:
      "Un Porteur de type D n'a pas d'écran : il ne devrait pas être enregistré avec le type de support « Écran ».",
    severity: "danger",
  },
  {
    id: "hors-rayon",
    title: "Porteurs hors du rayon de leur zone",
    description:
      "La position du Porteur est en dehors du cercle de la zone à laquelle il est rattaché.",
    severity: "warning",
  },
  {
    id: "zone-inactive-porteurs-actifs",
    title: "Zones inactives avec des Porteurs actifs",
    description:
      "Les annonceurs ne voient pas les zones inactives : leurs Porteurs « Actif » ne sont pas réservables.",
    severity: "warning",
  },
  {
    id: "declaration-incomplete",
    title: "Type ou orientation non déclarés",
    description:
      "Sans type déclaré, la carte affiche une typologie estimée ; sans orientation, le cône d'orientation n'est pas dessiné.",
    severity: "info",
  },
  {
    id: "zone-vide",
    title: "Zones sans Porteur",
    description: "Aucun Porteur n'est rattaché à ces zones.",
    severity: "info",
  },
];

export interface CoherenceIssue {
  /** Stable key: `${rule}:${kind}:${id}`. */
  key: string;
  rule: CoherenceRuleId;
  severity: CoherenceSeverity;
  target: { kind: "support" | "zone"; id: number };
  /** Name of the zone or Porteur. */
  label: string;
  /** One French sentence explaining the finding. */
  detail: string;
  /** Hint for the fix (e.g. suggested zone). */
  hint?: string;
}

export interface CoherenceGroup {
  rule: CoherenceRule;
  issues: CoherenceIssue[];
}

export interface CoherenceReport {
  issues: CoherenceIssue[];
  groups: CoherenceGroup[];
  total: number;
  bySeverity: Record<CoherenceSeverity, number>;
}

const RULE_ORDER = new Map(COHERENCE_RULES.map((r, i) => [r.id, i]));

function issue(
  rule: CoherenceRuleId,
  target: CoherenceIssue["target"],
  label: string,
  detail: string,
  hint?: string,
): CoherenceIssue {
  const severity = COHERENCE_RULES.find((r) => r.id === rule)?.severity ?? "info";
  return {
    key: `${rule}:${target.kind}:${target.id}`,
    rule,
    severity,
    target,
    label,
    detail,
    ...(hint ? { hint } : {}),
  };
}

/** Distance (m) from a support to its zone centre, or null when the zone is unknown. */
export function distanceToZoneCentre(
  support: Pick<SupportResponse, "latitude" | "longitude">,
  zone: Pick<ZoneResponse, "latitude" | "longitude">,
): number {
  return haversineDistance(
    { lng: support.longitude, lat: support.latitude },
    { lng: zone.longitude, lat: zone.latitude },
  );
}

/** Runs every rule. Issues are sorted by rule (severity) then by name. */
export function checkNetworkCoherence(
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
): CoherenceReport {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const out: CoherenceIssue[] = [];

  for (const s of supports) {
    const { type, inferred } = resolvePorteurType(s);

    if (!inferred && type === "D" && s.supportType === "ECRAN") {
      out.push(
        issue(
          "type-d-ecran",
          { kind: "support", id: s.id },
          s.name,
          "Déclaré type D (sans écran) mais enregistré comme « Écran ».",
          "Changez le type de support ou le type de Porteur.",
        ),
      );
    }

    const zone = zoneById.get(s.zoneId);
    if (zone && zone.radiusKm !== null && zone.radiusKm > 0) {
      const d = distanceToZoneCentre(s, zone);
      if (d > zone.radiusKm * 1000 + 1e-6) {
        const suggested = suggestZoneForPoint({ lng: s.longitude, lat: s.latitude }, zones);
        out.push(
          issue(
            "hors-rayon",
            { kind: "support", id: s.id },
            s.name,
            `À ${formatDistance(d)} du centre de « ${zone.name} » (rayon ${formatDistance(zone.radiusKm * 1000)}).`,
            suggested && suggested.id !== zone.id
              ? `Zone qui contient ce point : « ${suggested.name} ».`
              : "Aucune zone ne contient ce point : déplacez le Porteur ou élargissez le rayon.",
          ),
        );
      }
    }

    const missing: string[] = [];
    if (inferred) missing.push("type de Porteur");
    if (type !== "D" && (s.headingDeg === null || s.headingDeg === undefined)) {
      missing.push("orientation");
    }
    if (missing.length > 0) {
      out.push(
        issue(
          "declaration-incomplete",
          { kind: "support", id: s.id },
          s.name,
          `Non déclaré : ${missing.join(" et ")}.`,
          inferred ? `Typologie estimée : type ${type}.` : undefined,
        ),
      );
    }
  }

  const counts = new Map<number, { all: number; actifs: number }>();
  for (const s of supports) {
    const c = counts.get(s.zoneId) ?? { all: 0, actifs: 0 };
    c.all += 1;
    if (s.technicalStatus === "ACTIF") c.actifs += 1;
    counts.set(s.zoneId, c);
  }

  for (const z of zones) {
    const c = counts.get(z.id) ?? { all: 0, actifs: 0 };
    if (c.all === 0) {
      out.push(issue("zone-vide", { kind: "zone", id: z.id }, z.name, "Aucun Porteur rattaché."));
    }
    if (!z.isActive && c.actifs > 0) {
      out.push(
        issue(
          "zone-inactive-porteurs-actifs",
          { kind: "zone", id: z.id },
          z.name,
          `Zone inactive avec ${c.actifs} Porteur${c.actifs > 1 ? "s" : ""} « Actif ».`,
          "Activez la zone ou changez l'état de ses Porteurs.",
        ),
      );
    }
  }

  out.sort(
    (a, b) =>
      (RULE_ORDER.get(a.rule) ?? 0) - (RULE_ORDER.get(b.rule) ?? 0) ||
      a.label.localeCompare(b.label, "fr"),
  );

  const groups = COHERENCE_RULES.map((rule) => ({
    rule,
    issues: out.filter((i) => i.rule === rule.id),
  })).filter((g) => g.issues.length > 0);

  return {
    issues: out,
    groups,
    total: out.length,
    bySeverity: {
      danger: out.filter((i) => i.severity === "danger").length,
      warning: out.filter((i) => i.severity === "warning").length,
      info: out.filter((i) => i.severity === "info").length,
    },
  };
}

/** Issue keys touching one target (to badge a Porteur or zone in the inspector). */
export function issuesFor(
  report: CoherenceReport,
  kind: "support" | "zone",
  id: number,
): CoherenceIssue[] {
  return report.issues.filter((i) => i.target.kind === kind && i.target.id === id);
}
