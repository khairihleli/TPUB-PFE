"use client";

import {
  ChevronDown,
  EyeOff,
  Info,
  Maximize,
  Minimize,
  NotebookPen,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { PlayerState } from "@/components/player/player-screen";
import { formatCountdown, secondsUntil } from "@/components/player/player-schedule";
import { useNow } from "@/components/player/use-now";
import type { DiffusionTypeUpper } from "@/lib/api/types";
import { cx } from "@/lib/cx";

const TYPE_LABEL: Record<DiffusionTypeUpper, string> = {
  PUBLICITE: "Publicité",
  URGENCE: "Message prioritaire",
  DEFAUT: "Contenu par défaut",
};

type Connection = { label: string; dot: string; text: string };

function connectionOf(state: PlayerState): Connection {
  if (state.error) return { label: "Hors connexion", dot: "bg-danger", text: "text-danger" };
  if (state.diffusion === null)
    return { label: "Connexion…", dot: "bg-warning", text: "text-warning" };
  if (state.paused)
    return { label: "En pause (onglet masqué)", dot: "bg-muted", text: "text-muted" };
  return { label: "Connecté", dot: "bg-success", text: "text-success" };
}

/** Phones and short landscape viewports: the panel starts collapsed so it never hides the slide. */
const COMPACT_QUERY = "(max-width: 639px), (max-height: 520px)";

function subscribeCompact(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(COMPACT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getCompact(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_QUERY).matches
  );
}

function useCompact(): boolean {
  return useSyncExternalStore(subscribeCompact, getCompact, () => false);
}

function isEditableTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
  );
}

const ICON_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/8 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text";

const PILL_BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-3.5 font-label text-[0.75rem] font-semibold text-ink-soft transition-colors hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text disabled:opacity-60";

/**
 * Small corner panel: support id, zone, content type, countdown to the next call, the
 * « chaque appel est journalisé » note, fullscreen toggle and a hide button.
 * Compact mode (phones, short landscape screens): one header row (state + countdown), the
 * short note, and a « détails » disclosure.
 * Shortcuts: I toggles the panel, F toggles fullscreen.
 */
export function PlayerOverlay({
  supportId,
  state,
  onRetry,
  simulated = false,
}: {
  supportId: number;
  state: PlayerState;
  onRetry: () => void;
  /** `?datetime=` simulation: the backend receives a simulated local date-time. */
  simulated?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const compact = useCompact();
  const now = useNow(visible);

  useEffect(() => {
    setCanFullscreen(typeof document.documentElement.requestFullscreen === "function");
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isEditableTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "i") setVisible((v) => !v);
      else if (k === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const conn = connectionOf(state);
  const seconds = secondsUntil(state.nextAt, now);
  const nextLabel = state.pending
    ? "Appel en cours…"
    : state.paused
      ? "Reprise à l'affichage de l'onglet"
      : `dans ${formatCountdown(seconds)}`;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-label="Afficher les informations de l'écran"
        title="Afficher les informations (touche I)"
        className="absolute top-3 right-3 z-(--z-overlay) inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/80 opacity-25 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
      >
        <Info aria-hidden="true" className="size-5" />
      </button>
    );
  }

  const details = !compact || expanded;
  const detailsId = `lecteur-details-${supportId}`;

  return (
    <aside
      aria-label="Informations du lecteur"
      className="absolute top-3 right-3 z-(--z-overlay) w-[min(344px,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-white/12 bg-black/60 text-ink shadow-card backdrop-blur-md sm:top-4 sm:right-4"
    >
      <div aria-hidden="true" className="hairline-tricolor opacity-70" />
      <div className="flex items-center justify-between gap-2 pt-1.5 pl-4">
        <span className="inline-flex min-w-0 items-center gap-2 font-label text-[0.6875rem] font-bold tracking-[0.16em] text-ink-strong uppercase">
          <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[0.625rem] tracking-[0.12em] text-warning">
            Démo
          </span>
          {details ? (
            <span className="truncate">Lecteur TPUB</span>
          ) : (
            // Compact: connection state + countdown live in the header row.
            <span
              className={cx(
                "inline-flex min-w-0 items-center gap-1.5 text-[0.75rem] font-semibold tracking-normal normal-case",
                conn.text,
              )}
            >
              <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", conn.dot)} />
              <span className="truncate">{conn.label}</span>
              <span className="shrink-0 font-normal text-muted tabular">· {nextLabel}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center pr-1">
          {compact ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={expanded ? "Réduire les informations du lecteur" : "Détails du lecteur"}
              className={ICON_BUTTON}
            >
              <ChevronDown
                aria-hidden="true"
                className={cx("size-4.5 transition-transform", expanded && "rotate-180")}
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Masquer les informations de l'écran"
            title="Masquer (touche I)"
            className={ICON_BUTTON}
          >
            <EyeOff aria-hidden="true" className="size-4.5" />
          </button>
        </span>
      </div>

      <div id={detailsId} hidden={!details}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 pt-1 pb-3 text-[0.8125rem]">
          <div className="min-w-0">
            <dt className="text-[0.6875rem] text-muted-2">Écran</dt>
            <dd className="font-label font-semibold text-ink-strong tabular">n° {supportId}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[0.6875rem] text-muted-2">État</dt>
            <dd
              className={cx("inline-flex items-center gap-1.5 font-label font-semibold", conn.text)}
            >
              <span aria-hidden="true" className={cx("size-1.5 rounded-full", conn.dot)} />
              {conn.label}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[0.6875rem] text-muted-2">Zone</dt>
            <dd className="truncate text-ink-soft">{state.diffusion?.zone ?? "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[0.6875rem] text-muted-2">Contenu</dt>
            <dd className="truncate text-ink-soft">
              {state.diffusion ? TYPE_LABEL[state.diffusion.type] : "—"}
            </dd>
          </div>
          {simulated ? (
            <div className="col-span-2 min-w-0">
              <dt className="text-[0.6875rem] text-muted-2">Heure simulée (?datetime)</dt>
              <dd className="font-label font-semibold text-warning tabular">
                {state.diffusion?.datetime?.replace("T", " à ") ?? "—"}
              </dd>
            </div>
          ) : null}
          <div className="col-span-2 min-w-0">
            <dt className="text-[0.6875rem] text-muted-2">
              {state.error ? "Nouvelle tentative" : "Prochain appel"}
            </dt>
            <dd className="font-label font-semibold text-ink-strong tabular">
              {nextLabel}
              {state.error && state.attempt > 0 ? (
                <span className="ml-2 font-sans font-normal text-muted">
                  tentative {state.attempt}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      <p
        className={cx(
          "mx-4 flex gap-2 rounded-control border border-line bg-white/[0.03] px-3 py-2 text-[0.75rem] leading-snug text-muted",
          !details && "mb-3",
        )}
      >
        <NotebookPen
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-brand-orange-text"
        />
        <span>
          {details
            ? "Chaque appel est journalisé : il ajoute une ligne au journal de diffusion, qu'il y ait quelqu'un devant l'écran ou non."
            : "Chaque appel est journalisé : une ligne de plus au journal de diffusion."}
        </span>
      </p>

      {details ? (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-4">
          {canFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              className={PILL_BUTTON}
            >
              {fullscreen ? (
                <Minimize aria-hidden="true" className="size-4" />
              ) : (
                <Maximize aria-hidden="true" className="size-4" />
              )}
              Plein écran
            </button>
          ) : null}
          {state.error ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={state.pending}
              className={PILL_BUTTON}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Réessayer
            </button>
          ) : null}
          {compact ? null : (
            <span className="ml-auto text-[0.6875rem] text-muted">
              <kbd className="font-label">I</kbd> infos · <kbd className="font-label">F</kbd> plein
              écran
            </span>
          )}
        </div>
      ) : state.error ? (
        <div className="px-4 pb-3">
          <button type="button" onClick={onRetry} disabled={state.pending} className={PILL_BUTTON}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Réessayer
          </button>
        </div>
      ) : null}
    </aside>
  );
}
