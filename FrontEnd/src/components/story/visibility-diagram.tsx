import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { VISIBILITY_SECTION } from "@/components/story/reseau-content";

function Marker({ x, y, n, tone }: { x: number; y: number; n: number; tone: "muted" | "orange" }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="15"
        className={tone === "orange" ? "fill-brand-orange stroke-bg" : "fill-surface-3 stroke-bg"}
        strokeWidth="3"
      />
      <text
        x={x}
        y={y + 6}
        textAnchor="middle"
        fontSize="17"
        fontWeight="700"
        className={tone === "orange" ? "fill-on-orange" : "fill-ink-strong"}
      >
        {n}
      </text>
    </g>
  );
}

/**
 * Top-down schematic: a flow along a street, a large screen parallel to it (seen sideways)
 * versus a medium screen facing the flow (in the line of sight). No values, labelled « Schéma ».
 */
export function VisibilityDiagram() {
  return (
    <figure className="relative overflow-hidden rounded-panel border border-line bg-bg-2 p-4 sm:p-6">
      <div aria-hidden="true" className="pixel-grid absolute inset-0 opacity-15" />
      <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex rounded-full border border-line-strong bg-black/40 px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
          Schéma
        </span>
        <span className="inline-flex items-center gap-2 text-[0.8125rem] text-brand-blue-text">
          <span aria-hidden="true">→</span> Sens du flux
        </span>
      </div>
      <svg aria-hidden="true" viewBox="0 0 560 280" className="relative block h-auto w-full">
        <defs>
          <linearGradient id="vis-cone-wide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-muted)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-muted)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vis-cone-aligned" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--color-brand-orange)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-brand-orange)" stopOpacity="0" />
          </linearGradient>
          <marker
            id="vis-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" className="fill-brand-blue-text" />
          </marker>
        </defs>

        {/* Street */}
        <rect x="0" y="100" width="560" height="96" className="fill-surface" />
        <line x1="0" y1="100" x2="560" y2="100" className="stroke-line-strong" strokeWidth="1" />
        <line x1="0" y1="196" x2="560" y2="196" className="stroke-line-strong" strokeWidth="1" />
        <line
          x1="0"
          y1="148"
          x2="560"
          y2="148"
          className="stroke-line"
          strokeWidth="2"
          strokeDasharray="16 14"
        />
        {[124, 172].map((y) => (
          <line
            key={y}
            x1="20"
            y1={y}
            x2="118"
            y2={y}
            className="stroke-brand-blue-text"
            strokeWidth="3"
            markerEnd="url(#vis-arrow)"
          />
        ))}

        {/* 1 · Wide screen parallel to the flow */}
        <polygon points="170,86 330,86 390,280 110,280" fill="url(#vis-cone-wide)" />
        <rect
          x="170"
          y="72"
          width="160"
          height="14"
          rx="3"
          className="fill-surface-3 stroke-muted"
          strokeWidth="1.5"
        />
        <Marker x={250} y={40} n={1} tone="muted" />

        {/* 2 · Medium screen facing the flow */}
        <polygon points="486,116 486,180 230,200 230,96" fill="url(#vis-cone-aligned)" />
        <rect
          x="486"
          y="108"
          width="14"
          height="80"
          rx="3"
          className="fill-brand-orange stroke-brand-orange-text"
          strokeWidth="1.5"
        />
        <Marker x={493} y={236} n={2} tone="orange" />
      </svg>
      <figcaption className="relative mt-4 grid gap-2 border-t border-line pt-4 text-[0.875rem] sm:grid-cols-2 sm:gap-4">
        <span className="flex items-start gap-2.5 text-muted">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 font-label text-[0.75rem] font-bold text-ink-strong">
            1
          </span>
          <span>{VISIBILITY_SECTION.wide} : vu de côté, brièvement.</span>
        </span>
        <span className="flex items-start gap-2.5 text-ink-soft">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-orange font-label text-[0.75rem] font-bold text-on-orange">
            2
          </span>
          <span>{VISIBILITY_SECTION.aligned} : face au flux.</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** « Pourquoi un score de visibilité ? » */
export function VisibilitySection() {
  return (
    <Section tone="band" spacing="tight" labelledBy="visibilite-titre">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-4">
          <p className="eyebrow">Visibilité</p>
          <h2 id="visibilite-titre" className="font-display text-h3 text-ink-strong">
            {VISIBILITY_SECTION.title}
          </h2>
          <p className="max-w-[52ch] text-[1rem] leading-relaxed text-muted">
            {VISIBILITY_SECTION.text}
          </p>
          <p className="mt-2 font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase">
            {VISIBILITY_SECTION.factorsLabel}
          </p>
          <ul className="flex flex-wrap gap-2">
            {VISIBILITY_SECTION.factors.map((f) => (
              <li
                key={f}
                className="rounded-full border border-line-strong bg-white/[0.03] px-3 py-1.5 text-[0.875rem] text-ink-soft"
              >
                {f}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal variant="zoom" delay={100}>
          <VisibilityDiagram />
        </Reveal>
      </div>
    </Section>
  );
}
