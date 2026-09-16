"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export interface ExampleCreative {
  /** Small tag above the line, e.g. « Commerce de quartier ». */
  kicker: string;
  /** Main line (French, short). */
  line: string;
  /** Sub-line, e.g. « À 200 m · rue piétonne ». */
  sub: string;
  /** Campaign name used in the simulated log. */
  campaign: string;
  /** Visual theme (token-based gradient). */
  theme: "brand" | "blue" | "green" | "amber";
}

export const DEFAULT_CREATIVES: readonly ExampleCreative[] = [
  {
    kicker: "Commerce de quartier",
    line: "Pain chaud jusqu'à 21 h.",
    sub: "À 200 m · rue piétonne",
    campaign: "Campagne FOURNIL",
    theme: "brand",
  },
  {
    kicker: "Événement culturel",
    line: "Festival d'été, ce week-end.",
    sub: "Centre-ville · 18 h – 23 h",
    campaign: "Campagne ÉTÉ",
    theme: "blue",
  },
  {
    kicker: "Sensibilisation",
    line: "Triez, on s'occupe du reste.",
    sub: "Message d'intérêt général",
    campaign: "Campagne VERT",
    theme: "green",
  },
  {
    kicker: "Mobilité",
    line: "Un départ toutes les 10 min.",
    sub: "Station de tramway",
    campaign: "Campagne LIGNE",
    theme: "amber",
  },
];

const THEME: Record<ExampleCreative["theme"], string> = {
  brand:
    "bg-[radial-gradient(90%_70%_at_80%_10%,color-mix(in_srgb,var(--color-brand-orange)_85%,transparent),transparent_60%),linear-gradient(155deg,var(--color-brand-red-600),var(--color-brand-red)_45%,var(--color-bg)_120%)]",
  blue: "bg-[radial-gradient(90%_70%_at_20%_0%,color-mix(in_srgb,var(--color-brand-blue-text)_70%,transparent),transparent_60%),linear-gradient(160deg,var(--color-brand-blue),var(--color-brand-blue-600)_55%,var(--color-bg)_125%)]",
  green:
    "bg-[radial-gradient(80%_60%_at_75%_15%,color-mix(in_srgb,var(--color-success)_65%,transparent),transparent_60%),linear-gradient(160deg,color-mix(in_srgb,var(--color-success)_55%,var(--color-bg)),var(--color-bg)_115%)]",
  amber:
    "bg-[radial-gradient(90%_70%_at_30%_10%,color-mix(in_srgb,var(--color-warning)_80%,transparent),transparent_60%),linear-gradient(160deg,var(--color-brand-orange),color-mix(in_srgb,var(--color-brand-red)_70%,var(--color-bg))_70%,var(--color-bg)_120%)]",
};

const SCREENS = ["A-12", "C-04", "B-07", "A-03", "C-11", "B-02"] as const;
const ZONES = ["Tunis Centre", "Les Berges du Lac", "La Marsa", "Sousse Centre"] as const;

interface LogLine {
  id: number;
  text: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Deterministic simulated log line for step n (no clock read: SSR-safe). */
function logLine(step: number, creatives: readonly ExampleCreative[]): LogLine {
  const base = 14 * 3600 + 2 * 60 + 10; // 14:02:10
  const t = base + step * 10 + 86400;
  const hh = Math.floor(t / 3600) % 24;
  const mm = Math.floor(t / 60) % 60;
  const ss = t % 60;
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const creative = creatives[mod(step, creatives.length)] ?? creatives[0];
  const screen = SCREENS[mod(step, SCREENS.length)];
  const zone = ZONES[mod(step * 3, ZONES.length)];
  return {
    id: step,
    text: `${pad(hh)}:${pad(mm)}:${pad(ss)} · Écran ${screen} · ${zone} · 10 s · ${creative?.campaign ?? ""}`,
  };
}

export interface BroadcastScreenProps {
  creatives?: readonly ExampleCreative[];
  /** ms per creative, default 4400. */
  interval?: number;
  /** Hide the simulated diffusion log under the screen. */
  hideLog?: boolean;
  /** Hide the log only below this breakpoint (keeps tall heroes compact on mobile). */
  hideLogBelow?: "md" | "lg";
  className?: string;
}

/**
 * Decorative DOOH screen: crossfading EXAMPLE creatives, progress bar, dots, a pulsing
 * « DÉMO » dot (never "LIVE") and a simulated diffusion log labelled « Illustration ».
 * No impression counter. Reduced motion = static first frame.
 */
export function BroadcastScreen({
  creatives = DEFAULT_CREATIVES,
  interval = 4400,
  hideLog = false,
  hideLogBelow,
  className,
}: BroadcastScreenProps) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const count = creatives.length;

  // Only animate while on screen and the tab is visible.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      threshold: 0.15,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !visible || count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setIndex((i) => (i + 1) % count);
      setStep((s) => s + 1);
    }, interval);
    return () => window.clearInterval(id);
  }, [reduce, visible, count, interval]);

  const lines: LogLine[] = [];
  for (let s = step - 4; s <= step; s++) lines.push(logLine(s, creatives));
  const animate = !reduce;

  return (
    <div ref={rootRef} className={cx("relative mx-auto w-full max-w-[400px]", className)}>
      <p className="sr-only">
        Illustration d&apos;un écran TPUB diffusant à tour de rôle des créations d&apos;exemple,
        avec un extrait simulé de journal de diffusion. Aucune donnée réelle.
      </p>

      <div aria-hidden="true">
        {/* Glow */}
        <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(50%_50%_at_50%_40%,var(--color-orange-soft),transparent_70%)] blur-2xl" />

        {/* Screen */}
        <div className="relative overflow-hidden rounded-panel border border-line-strong bg-black shadow-card ring-8 ring-white/[0.025]">
          {/* Bezel */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="inline-flex items-center gap-2 font-label text-[0.6875rem] font-bold tracking-[0.16em] text-ink-strong">
              <span className="pulse-dot size-2 text-brand-red-text" />
              DÉMO
            </span>
            <span className="rounded-full border border-line-strong px-2 py-0.5 font-label text-[0.625rem] font-semibold tracking-[0.12em] text-muted uppercase">
              Exemple
            </span>
            <span className="font-label text-[0.6875rem] font-semibold text-muted tabular">
              {index + 1}/{count}
            </span>
          </div>

          {/* Stage: layered crossfade */}
          <div className="relative aspect-[4/5] overflow-hidden">
            {creatives.map((c, i) => (
              <div
                key={c.campaign}
                className={cx(
                  "absolute inset-0 flex flex-col justify-end gap-2 p-6 transition-opacity duration-700 ease-smooth sm:p-7",
                  THEME[c.theme],
                  i === index ? "opacity-100" : "opacity-0",
                )}
              >
                <div className="pixel-grid absolute inset-0 opacity-70 mix-blend-overlay" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--color-black)_55%,transparent))]" />
                <span className="relative font-label text-[0.6875rem] font-bold tracking-[0.24em] text-white/85 uppercase">
                  {c.kicker}
                </span>
                <span
                  key={i === index ? `on-${step}` : "off"}
                  className={cx(
                    "relative font-display text-[clamp(1.7rem,6.5vw,2.35rem)] leading-[1.02] font-bold tracking-tight text-white",
                    animate && i === index && "enter",
                  )}
                >
                  {c.line}
                </span>
                <span className="relative text-[0.8125rem] font-medium text-white/80">{c.sub}</span>
                <span className="relative mt-1 font-label text-[0.625rem] font-semibold tracking-[0.16em] text-white/60 uppercase">
                  Exemple · Réseau TPUB
                </span>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="h-[3px] bg-white/10">
            <div
              key={`p-${step}`}
              className="h-full origin-left bg-grad-brand"
              style={
                animate && visible
                  ? { animation: `progress-fill ${interval}ms linear both` }
                  : { transform: "scaleX(0.35)" }
              }
            />
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-[0.75rem] text-muted">
            <span>Boucle de diffusion · 10 s par spot</span>
            <span className="font-label font-semibold text-ink-soft">Porteur · Type C</span>
          </div>
        </div>

        {/* Dots */}
        <div className="mt-4 flex justify-center gap-2">
          {creatives.map((c, i) => (
            <span
              key={c.campaign}
              className={cx(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-brand-orange" : "w-1.5 bg-white/25",
              )}
            />
          ))}
        </div>

        {/* Simulated log */}
        {hideLog ? null : (
          <div
            className={cx(
              "mt-6 overflow-hidden rounded-card border border-line bg-bg/70 backdrop-blur-md",
              hideLogBelow === "md" && "max-md:hidden",
              hideLogBelow === "lg" && "max-lg:hidden",
            )}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-label text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">
                Journal de diffusion
              </span>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-label text-[0.625rem] font-semibold tracking-[0.08em] text-warning uppercase">
                Illustration
              </span>
            </div>
            <ol className="flex h-[132px] flex-col justify-end overflow-hidden px-4 py-2.5 font-mono text-[0.6875rem] leading-[1.9] text-muted">
              {lines.map((l, i) => (
                <li
                  key={l.id}
                  className={cx(
                    "truncate",
                    i === lines.length - 1 ? "text-ink-soft" : "",
                    animate && i === lines.length - 1 && step > 0 && "enter",
                  )}
                >
                  <span className={i === lines.length - 1 ? "text-brand-orange-text" : ""}>›</span>{" "}
                  {l.text}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
