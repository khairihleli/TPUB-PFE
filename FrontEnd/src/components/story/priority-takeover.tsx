import { ArrowRight, BellRing, Check } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { PRIORITY_SECTION } from "@/components/story/fonctionnement-content";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

type SlotKind = "campaign" | "fallback" | "message";

interface Slot {
  kind: SlotKind;
  /** Relative width (flex-grow). */
  grow: number;
}

/** Normal loop → priority message on in-zone screens → resume. Three phases of equal-ish width. */
export const TAKEOVER_ROWS: readonly { key: "in" | "out"; phases: readonly (readonly Slot[])[] }[] =
  [
    {
      key: "in",
      phases: [
        [
          { kind: "campaign", grow: 2 },
          { kind: "fallback", grow: 1 },
          { kind: "campaign", grow: 2 },
        ],
        [{ kind: "message", grow: 1 }],
        [
          { kind: "campaign", grow: 2 },
          { kind: "campaign", grow: 2 },
        ],
      ],
    },
    {
      key: "out",
      phases: [
        [
          { kind: "campaign", grow: 2 },
          { kind: "fallback", grow: 1 },
          { kind: "campaign", grow: 2 },
        ],
        [
          { kind: "campaign", grow: 2 },
          { kind: "fallback", grow: 1 },
        ],
        [
          { kind: "campaign", grow: 2 },
          { kind: "campaign", grow: 2 },
        ],
      ],
    },
  ];

const SLOT_CLASS: Record<SlotKind, string> = {
  campaign: "border-orange-line bg-orange-soft text-brand-orange-text",
  fallback: "border-blue-line bg-blue-soft text-brand-blue-text",
  message:
    "border-red-line bg-[repeating-linear-gradient(135deg,var(--color-red-soft)_0_8px,transparent_8px_14px)] text-brand-red-text",
};

const S = PRIORITY_SECTION.schema;
const SLOT_LABEL: Record<SlotKind, string> = {
  campaign: S.campaign,
  fallback: S.fallback,
  message: S.message,
};

/**
 * Only the priority message carries a text label (it spans its whole phase, so it never
 * truncates); campaign and default blocks are colour + legend, never « Ca… » stubs.
 */
function SlotBlock({ slot }: { slot: Slot }) {
  return (
    <span
      className={cx(
        "flex h-11 min-w-0 items-center justify-center overflow-hidden rounded-[8px] border px-1.5 font-label text-[0.6875rem] leading-tight font-semibold sm:h-12",
        SLOT_CLASS[slot.kind],
      )}
      style={{ flexGrow: slot.grow, flexBasis: 0 }}
    >
      {slot.kind === "message" ? (
        <span className="hidden text-center md:inline">{SLOT_LABEL[slot.kind]}</span>
      ) : null}
    </span>
  );
}

/** Schematic of a priority message taking over in-zone screens (labelled « Schéma »). */
export function PriorityTakeoverSchema() {
  const phaseLabels = [
    { full: S.normal, short: S.normalShort },
    { full: S.priority, short: S.priorityShort },
    { full: S.resume, short: S.resume },
  ];
  return (
    <figure className="relative overflow-hidden rounded-panel border border-line bg-bg-2 p-4 sm:p-6">
      <figcaption className="sr-only">
        Schéma : pendant la programmation normale, les écrans alternent campagnes et contenu par
        défaut. Lorsqu&apos;un message prioritaire est actif, il remplace la programmation des
        écrans situés dans la zone concernée, tandis que les écrans hors zone continuent
        normalement. La programmation reprend à la fin du message.
      </figcaption>
      <div aria-hidden="true">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="rounded-full border border-line-strong bg-black/40 px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Schéma
          </span>
          <span className="text-[0.75rem] text-muted-2">Temps →</span>
        </div>

        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 pl-0 sm:pl-[112px]">
          {phaseLabels.map((label, i) => (
            <span
              key={label.full}
              className={cx(
                "min-w-0 border-b pb-2 font-label text-[0.625rem] leading-snug font-semibold tracking-[0.06em] uppercase sm:text-[0.6875rem]",
                i === 1 ? "border-red-line text-brand-red-text" : "border-line text-muted",
              )}
            >
              <span className="sm:hidden">{label.short}</span>
              <span className="hidden sm:inline">{label.full}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {TAKEOVER_ROWS.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[104px_1fr] sm:items-center sm:gap-2"
            >
              <span className="text-[0.8125rem] font-medium text-ink-soft">
                {row.key === "in" ? S.inZone : S.outZone}
              </span>
              <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                {row.phases.map((slots, p) => (
                  <div key={p} className="flex gap-1">
                    {slots.map((slot, i) => (
                      <SlotBlock key={i} slot={slot} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-[0.8125rem] text-muted">
          {(["campaign", "fallback", "message"] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-2">
              <span className={cx("h-3 w-6 rounded-[4px] border", SLOT_CLASS[kind])} />
              {SLOT_LABEL[kind]}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** « Quand l'intérêt général passe avant la publicité » */
export function PriorityTakeover() {
  return (
    <Section id="interet-general" tone="band" labelledBy="interet-general-titre">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-5">
          <p className="eyebrow">{PRIORITY_SECTION.eyebrow}</p>
          <h2 id="interet-general-titre" className="font-display text-h2 text-ink-strong">
            {PRIORITY_SECTION.title}{" "}
            <span className="text-gradient">{PRIORITY_SECTION.highlight}</span>
          </h2>
          <p className="max-w-[56ch] text-[1rem] leading-relaxed text-muted">
            {PRIORITY_SECTION.text}
          </p>
          <ul className="flex flex-col gap-2.5">
            {PRIORITY_SECTION.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[0.9375rem] text-ink-soft">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-red-line bg-red-soft text-brand-red-text [&_svg]:size-3"
                >
                  <Check />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <Button asChild variant="outline" shape="pill">
              <Link href={PRIORITY_SECTION.cta.href}>
                <BellRing aria-hidden="true" />
                {PRIORITY_SECTION.cta.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Reveal>
        <Reveal variant="right" delay={120}>
          <PriorityTakeoverSchema />
        </Reveal>
      </div>
    </Section>
  );
}
