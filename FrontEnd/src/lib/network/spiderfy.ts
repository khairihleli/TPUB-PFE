/**
 * Spiderfy: Porteur markers that would overlap on screen are fanned out around the centre of
 * their group (circle up to 8 markers, Archimedean spiral beyond), each keeping a thin leader
 * line back to its exact projected position. Pure screen-space math (px), unit-tested; used by
 * the MapLibre engine (map.project) and by the SVG fallback (viewBox → px).
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface SpiderPoint<K extends string | number = number> extends ScreenPoint {
  id: K;
}

/** Marker hit-area diameters (px) used as the overlap threshold. */
export const PORTEUR_MARKER_PX = {
  /** Compact dot (zoom < FULL_MARKER_MIN_ZOOM): 16 px dot inside a 24 px target. */
  compact: 24,
  /** Full lettered marker: 36 px button + selection ring. */
  full: 38,
} as const;

/** The lettered marker is shown from this zoom; below it Porteurs are compact dots. */
export const FULL_MARKER_MIN_ZOOM = 9;

/** Groups up to this size are laid out on a circle, larger groups on a spiral. */
export const SPIDER_CIRCLE_MAX = 8;

export interface SpiderOptions {
  /** Marker diameter (px): two markers closer than this overlap. */
  markerSize: number;
  /** Extra space between fanned markers (px). Default: max(4, 20 % of the marker size). */
  gap?: number;
  /** Circle layout up to this group size (default 8), spiral beyond. */
  circleMax?: number;
}

export interface SpiderLeader {
  /** Exact projected position of the Porteur. */
  from: ScreenPoint;
  /** Centre of the fanned marker. */
  to: ScreenPoint;
}

export interface SpiderPlacement<K extends string | number = number> {
  id: K;
  /** Exact projected position. */
  exact: ScreenPoint;
  /** Where the marker is drawn (= exact when not displaced). */
  position: ScreenPoint;
  /** position − exact (px). */
  offset: ScreenPoint;
  displaced: boolean;
  /** Key of the fanned group, null for an isolated marker. */
  group: string | null;
  /** Leader line (exact → marker) for displaced markers, else null. */
  leader: SpiderLeader | null;
}

export interface SpiderGroup<K extends string | number = number> {
  key: string;
  ids: K[];
  /** Mean of the members' exact positions: the fan is centred here. */
  center: ScreenPoint;
  layout: "circle" | "spiral";
}

export interface SpiderResult<K extends string | number = number> {
  /** One placement per valid input point, sorted by id. */
  placements: SpiderPlacement<K>[];
  groups: SpiderGroup<K>[];
  byId: Map<K, SpiderPlacement<K>>;
}

const compareIds = <K extends string | number>(a: K, b: K) => (a < b ? -1 : a > b ? 1 : 0);

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);

export function defaultSpiderGap(markerSize: number): number {
  return Math.max(4, markerSize * 0.2);
}

/**
 * Slot offsets on a circle (relative to the group centre), first slot at `startAngle`
 * (radians, 0 = up, clockwise in screen space). Neighbouring slots are ≥ size + gap apart.
 */
export function circleSlots(
  count: number,
  markerSize: number,
  gap = defaultSpiderGap(markerSize),
  startAngle = 0,
): ScreenPoint[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const spacing = markerSize + gap;
  const radius = n === 1 ? markerSize : Math.max(markerSize, spacing / (2 * Math.sin(Math.PI / n)));
  return Array.from({ length: n }, (_, i) => {
    const a = startAngle + (2 * Math.PI * i) / n;
    return { x: radius * Math.sin(a), y: -radius * Math.cos(a) };
  });
}

/**
 * Slot offsets on an Archimedean spiral r(θ) = s + sθ/2π (turns s apart), consecutive slots
 * placed with a chord ≥ s where s = size + gap, so no two slots overlap.
 */
export function spiralSlots(
  count: number,
  markerSize: number,
  gap = defaultSpiderGap(markerSize),
  startAngle = 0,
): ScreenPoint[] {
  const n = Math.max(0, Math.floor(count));
  const s = markerSize + gap;
  const b = s / (2 * Math.PI);
  const out: ScreenPoint[] = [];
  let theta = 0;
  for (let i = 0; i < n; i++) {
    const r = s + b * theta;
    const a = startAngle + theta;
    out.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
    theta += 2 * Math.asin(Math.min(1, s / (2 * r)));
  }
  return out;
}

class DisjointSet {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r] as number;
    let c = i;
    while (this.parent[c] !== r) {
      const next = this.parent[c] as number;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  /** True when two different sets were merged. */
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    // smallest index stays root: deterministic
    if (ra < rb) this.parent[rb] = ra;
    else this.parent[ra] = rb;
    return true;
  }
}

/** Clockwise angle from « up » of `p` around `c` (radians, [0, 2π)). */
function angleAround(c: ScreenPoint, p: ScreenPoint): number {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  const a = Math.atan2(dx, -dy);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** Groups up to this size get an exhaustive slot assignment (7! = 5 040 orders at most). */
const EXHAUSTIVE_ASSIGNMENT_MAX = 7;
/** Rotations of the circle tried within one slot step. */
const CIRCLE_ROTATION_STEPS = 6;

/**
 * Circle slots + member → slot assignment minimising the total leader length. `exact` is in
 * angular order around `center` (starting at `startAngle`). Small groups are searched
 * exhaustively (branch and bound), larger ones keep the angular order; both try a few
 * rotations of the circle. Ties keep the first candidate: deterministic.
 */
function bestCircleAssignment(
  exact: readonly ScreenPoint[],
  center: ScreenPoint,
  size: number,
  gap: number,
  startAngle: number,
): { slots: ScreenPoint[]; order: number[] } {
  const n = exact.length;
  const step = (2 * Math.PI) / Math.max(1, n);
  let best: { slots: ScreenPoint[]; order: number[]; cost: number } | null = null;

  for (let r = 0; r < CIRCLE_ROTATION_STEPS; r++) {
    const slots = circleSlots(n, size, gap, startAngle + (step * r) / CIRCLE_ROTATION_STEPS);
    const cost = exact.map((p) =>
      slots.map((s) => Math.hypot(center.x + s.x - p.x, center.y + s.y - p.y)),
    );
    const at = (i: number, k: number) => (cost[i] as number[])[k] as number;

    if (n > EXHAUSTIVE_ASSIGNMENT_MAX) {
      const order = Array.from({ length: n }, (_, k) => k);
      const total = order.reduce((sum, k, i) => sum + at(i, k), 0);
      if (!best || total < best.cost - 1e-9) best = { slots, order, cost: total };
      continue;
    }

    const used = new Array<boolean>(n).fill(false);
    const current: number[] = [];
    const found: { cost: number; order: number[] | null } = {
      cost: best ? best.cost - 1e-9 : Infinity,
      order: null,
    };
    const search = (i: number, acc: number): void => {
      if (acc >= found.cost) return;
      if (i === n) {
        found.cost = acc;
        found.order = [...current];
        return;
      }
      for (let k = 0; k < n; k++) {
        if (used[k]) continue;
        used[k] = true;
        current.push(k);
        search(i + 1, acc + at(i, k));
        current.pop();
        used[k] = false;
      }
    };
    search(0, 0);
    if (found.order) best = { slots, order: found.order, cost: found.cost };
  }

  return best ?? { slots: circleSlots(n, size, gap, startAngle), order: exact.map((_, k) => k) };
}

/**
 * Fans out overlapping markers. Deterministic (input order does not matter), and after layout
 * no two marker centres are closer than `markerSize`: fans that collide with each other or with
 * an isolated marker are merged and laid out again.
 */
export function spiderfy<K extends string | number>(
  points: readonly SpiderPoint<K>[],
  options: SpiderOptions,
): SpiderResult<K> {
  const size = Math.max(0, options.markerSize);
  const gap = options.gap ?? defaultSpiderGap(size);
  const circleMax = options.circleMax ?? SPIDER_CIRCLE_MAX;

  const pts = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => compareIds(a.id, b.id));
  const n = pts.length;
  const sets = new DisjointSet(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (distance(pts[i] as ScreenPoint, pts[j] as ScreenPoint) < size) sets.union(i, j);
    }
  }

  let positions: ScreenPoint[] = pts.map((p) => ({ x: p.x, y: p.y }));
  let groups: {
    root: number;
    members: number[];
    center: ScreenPoint;
    layout: "circle" | "spiral";
  }[] = [];

  const layout = () => {
    const byRoot = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = sets.find(i);
      const list = byRoot.get(r);
      if (list) list.push(i);
      else byRoot.set(r, [i]);
    }
    positions = pts.map((p) => ({ x: p.x, y: p.y }));
    groups = [];
    for (const [root, members] of byRoot) {
      if (members.length < 2) continue;
      let cx = 0;
      let cy = 0;
      for (const m of members) {
        cx += (pts[m] as ScreenPoint).x;
        cy += (pts[m] as ScreenPoint).y;
      }
      const center = { x: cx / members.length, y: cy / members.length };
      const ordered = members
        .map((m) => ({ m, a: angleAround(center, pts[m] as ScreenPoint) }))
        .sort(
          (p, q) =>
            p.a - q.a ||
            compareIds((pts[p.m] as SpiderPoint<K>).id, (pts[q.m] as SpiderPoint<K>).id),
        );
      const start = ordered[0]?.a ?? 0;
      const kind = members.length <= circleMax ? "circle" : "spiral";
      if (kind === "circle") {
        // Shortest total leader length: leaders never cross, so each marker reads as tied to
        // its own exact point (a crossing pair can always be swapped into a shorter one).
        const { slots, order } = bestCircleAssignment(
          ordered.map(({ m }) => pts[m] as ScreenPoint),
          center,
          size,
          gap,
          start,
        );
        order.forEach((slotIndex, k) => {
          const m = (ordered[k] as { m: number }).m;
          const slot = slots[slotIndex] ?? { x: 0, y: 0 };
          positions[m] = { x: center.x + slot.x, y: center.y + slot.y };
        });
      } else {
        const slots = spiralSlots(members.length, size, gap, start);
        ordered.forEach(({ m }, k) => {
          const slot = slots[k] ?? { x: 0, y: 0 };
          positions[m] = { x: center.x + slot.x, y: center.y + slot.y };
        });
      }
      groups.push({ root, members, center, layout: kind });
    }
  };

  // Lay out, then merge any groups whose markers still collide; at most n − 1 merges.
  for (let guard = 0; guard <= n; guard++) {
    layout();
    let merged = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (sets.find(i) === sets.find(j)) continue;
        if (distance(positions[i] as ScreenPoint, positions[j] as ScreenPoint) < size - 1e-9) {
          merged = sets.union(i, j) || merged;
        }
      }
    }
    if (!merged) break;
  }

  const groupOf = new Map<number, string>();
  const outGroups: SpiderGroup<K>[] = groups
    .map((g) => {
      const ids = g.members.map((m) => (pts[m] as SpiderPoint<K>).id).sort(compareIds);
      const key = `spider-${ids.join(".")}`;
      for (const m of g.members) groupOf.set(m, key);
      return { key, ids, center: g.center, layout: g.layout };
    })
    .sort((a, b) => compareIds(a.key, b.key));

  const placements: SpiderPlacement<K>[] = pts.map((p, i) => {
    const exact = { x: p.x, y: p.y };
    const position = positions[i] as ScreenPoint;
    const group = groupOf.get(i) ?? null;
    const displaced = group !== null;
    return {
      id: p.id,
      exact,
      position,
      offset: { x: position.x - exact.x, y: position.y - exact.y },
      displaced,
      group,
      leader: displaced ? { from: exact, to: position } : null,
    };
  });

  return { placements, groups: outGroups, byId: new Map(placements.map((p) => [p.id, p])) };
}

/** Compact change signature (0.5 px precision) to avoid re-rendering identical layouts. */
export function spiderSignature<K extends string | number>(result: SpiderResult<K>): string {
  const r = (v: number) => Math.round(v * 2) / 2;
  return result.placements
    .filter((p) => p.displaced)
    .map((p) => `${p.id}:${r(p.offset.x)},${r(p.offset.y)}`)
    .join("|");
}

/** Smallest centre-to-centre distance between placed markers (Infinity with < 2 markers). */
export function minPlacementDistance<K extends string | number>(
  placements: readonly SpiderPlacement<K>[],
): number {
  let min = Infinity;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      min = Math.min(
        min,
        distance(
          (placements[i] as SpiderPlacement<K>).position,
          (placements[j] as SpiderPlacement<K>).position,
        ),
      );
    }
  }
  return min;
}
