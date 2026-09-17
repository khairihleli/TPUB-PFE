"use client";

import {
  CloudOff,
  Hourglass,
  KeyRound,
  MapPin,
  RefreshCw,
  SearchX,
  ServerCrash,
  ShieldCheck,
  Siren,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import {
  adMediaKind,
  formatCountdown,
  type PlayerErrorInfo,
} from "@/components/player/player-schedule";
import { urgencyTheme } from "@/components/player/urgency-theme";
import { GROUP, SITE } from "@/content/site";
import type { Diffusion } from "@/lib/api/types";
import { cx } from "@/lib/cx";

/**
 * Every slide = a full-viewport backdrop + a "safe area" (container-query units, so the
 * typography scales with the stage, never with the letterbox). Landscape viewports get a 16:9
 * stage; portrait viewports (9:16 totems, phones) use the whole viewport, and each slide carries
 * `portrait:` sizes tuned for a narrow, tall stage. Decorative layers are aria-hidden; the page's
 * accessible text lives in the safe area.
 */
/** Phones in portrait: keep the slide's top row clear of the (compact) info panel. */
const OVERLAY_CLEARANCE = "max-sm:portrait:pt-[36cqw]";

function SafeArea({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className={cx(
          "@container relative aspect-video w-[min(100vw,calc(100dvh*16/9))] max-w-full portrait:aspect-auto portrait:h-full portrait:w-full",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function driftStyle(
  animate: boolean,
  name: "aurora-a" | "aurora-b",
  seconds: number,
): CSSProperties {
  return animate ? { animation: `${name} ${seconds}s ease-in-out infinite alternate` } : {};
}

function Fade({ animate, children }: { animate: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0"
      style={animate ? { animation: "fade-in 0.7s var(--ease-out) both" } : undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publicité
// ---------------------------------------------------------------------------
export function AdSlide({
  diffusion,
  cycle,
  durationMs,
  animate,
  onMediaEnded,
  onActivate,
  clicked = false,
}: {
  diffusion: Diffusion;
  cycle: number;
  durationMs: number;
  animate: boolean;
  /** A video finished: the player asks for the next content right away. */
  onMediaEnded?: () => void;
  /** Tap / click on the publicité (counts one CLIC per diffusion). */
  onActivate?: () => void;
  /** The CLIC of the current diffusion was recorded. */
  clicked?: boolean;
}) {
  const kind = adMediaKind(diffusion);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const mediaUrl = diffusion.mediaUrl ?? "";
  const showMedia = kind !== "none" && failedUrl !== mediaUrl;
  const activation = onActivate ? (
    <>
      <button
        type="button"
        onClick={onActivate}
        aria-label={`Je suis intéressé par « ${diffusion.title} »`}
        className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-4 focus-visible:-outline-offset-8 focus-visible:outline-brand-blue-text"
      />
      {clicked ? (
        <p
          role="status"
          className="absolute bottom-6 left-1/2 z-[2] -translate-x-1/2 rounded-full border border-white/25 bg-black/65 px-4 py-2 font-label text-sm font-semibold text-white backdrop-blur-sm"
        >
          Intérêt enregistré, merci
        </p>
      ) : null}
    </>
  ) : null;

  if (showMedia) {
    return (
      <Fade animate={animate}>
        <div aria-hidden="true" className="absolute inset-0 bg-black" />
        <SafeArea className="overflow-hidden bg-black">
          {kind === "video" ? (
            <video
              // A new diffusion of the same spot restarts the video.
              key={diffusion.diffusionLogId ?? cycle}
              src={mediaUrl}
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-label={`Vidéo publicitaire : ${diffusion.title}`}
              onEnded={() => onMediaEnded?.()}
              onError={() => setFailedUrl(mediaUrl)}
              className="absolute inset-0 size-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin /uploads media of any size
            <img
              src={mediaUrl}
              alt={diffusion.title}
              draggable={false}
              onError={() => setFailedUrl(mediaUrl)}
              className="absolute inset-0 size-full object-contain"
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-[2cqw] bg-[linear-gradient(0deg,color-mix(in_srgb,var(--color-black)_70%,transparent),transparent)] px-[3cqw] pt-[5cqw] pb-[2.2cqw] portrait:px-[6cqw] portrait:pb-[5cqw]">
            <span className="inline-flex min-w-0 items-center gap-[1cqw] portrait:gap-[2.5cqw]">
              <span className="shrink-0 rounded-full border border-white/25 bg-black/35 px-[1.2cqw] py-[0.45cqw] font-label text-[1cqw] font-semibold tracking-[0.2em] text-white/90 uppercase portrait:px-[3cqw] portrait:py-[1.2cqw] portrait:text-[2.8cqw]">
                Publicité
              </span>
              <span className="truncate font-display text-[1.8cqw] font-semibold text-white portrait:text-[4.6cqw]">
                {diffusion.title}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-[0.6cqw] text-[1.3cqw] text-white/80 portrait:text-[3.6cqw]">
              <MapPin aria-hidden="true" className="size-[1.5cqw] portrait:size-[4cqw]" />
              {diffusion.zone}
            </span>
          </div>
        </SafeArea>
        {activation}
        {kind === "image" ? (
          <ProgressBar cycle={cycle} durationMs={durationMs} animate={animate} />
        ) : null}
      </Fade>
    );
  }

  const long = diffusion.title.length > 48;
  return (
    <Fade animate={animate}>
      {/* Backdrop: animated brand gradient */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-bg">
        <div
          className="absolute -inset-[30%] bg-[radial-gradient(38%_42%_at_35%_40%,color-mix(in_srgb,var(--color-brand-red)_78%,transparent),transparent_70%)] blur-3xl"
          style={driftStyle(animate, "aurora-a", 22)}
        />
        <div
          className="absolute -inset-[30%] bg-[radial-gradient(34%_38%_at_68%_62%,color-mix(in_srgb,var(--color-brand-orange)_70%,transparent),transparent_70%)] blur-3xl"
          style={driftStyle(animate, "aurora-b", 28)}
        />
        <div
          className="absolute -inset-[30%] bg-[radial-gradient(30%_30%_at_80%_20%,color-mix(in_srgb,var(--color-brand-blue)_55%,transparent),transparent_70%)] blur-3xl"
          style={driftStyle(animate, "aurora-a", 36)}
        />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--color-black)_62%,transparent)_0%,transparent_62%),linear-gradient(0deg,color-mix(in_srgb,var(--color-black)_55%,transparent),transparent_45%)]" />
        <div className="pixel-grid absolute inset-0 opacity-60 mix-blend-overlay" />
      </div>

      <SafeArea>
        <div
          className={cx(
            "absolute inset-0 flex flex-col justify-between p-[5.5cqw] portrait:p-[8cqw]",
            OVERLAY_CLEARANCE,
          )}
        >
          <div className="flex items-center justify-between gap-[2cqw]">
            <span className="inline-flex items-center gap-[0.8cqw] rounded-full border border-white/25 bg-black/25 px-[1.4cqw] py-[0.55cqw] font-label text-[1.05cqw] font-semibold tracking-[0.22em] text-white/90 uppercase backdrop-blur-sm portrait:px-[3.2cqw] portrait:py-[1.3cqw] portrait:text-[2.9cqw]">
              Publicité
            </span>
            <span className="inline-flex items-center gap-[0.8cqw] portrait:gap-[2cqw]">
              <Image
                src="/brand/tpub.png"
                alt=""
                width={64}
                height={70}
                draggable={false}
                className="h-auto w-[2.6cqw] portrait:w-[6.5cqw]"
              />
              <span className="font-display text-[1.6cqw] font-bold tracking-[0.16em] text-white portrait:text-[4.2cqw]">
                TPUB
              </span>
            </span>
          </div>

          <div
            key={`${diffusion.campaignId ?? "c"}-${diffusion.title}`}
            className="max-w-[78%] portrait:max-w-full"
          >
            <p className="enter flex items-center gap-[1cqw] font-label text-[1.2cqw] font-semibold tracking-[0.24em] text-brand-orange-text uppercase portrait:gap-[2.6cqw] portrait:text-[3.2cqw]">
              <span
                aria-hidden="true"
                className="h-[0.18cqw] w-[2.6cqw] bg-grad-brand portrait:h-[0.5cqw] portrait:w-[7cqw]"
              />
              Campagne
            </p>
            <p
              className={cx(
                "enter enter-1 mt-[1.6cqw] font-display leading-[1.02] font-bold tracking-[-0.025em] text-balance break-words text-white portrait:mt-[4cqw]",
                long ? "text-[5cqw] portrait:text-[9.5cqw]" : "text-[7.2cqw] portrait:text-[13cqw]",
              )}
            >
              {diffusion.title}
            </p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-[2cqw] portrait:flex-col portrait:items-start portrait:gap-[3cqw]">
            <p className="inline-flex items-center gap-[0.8cqw] text-[1.5cqw] font-medium text-white/85 portrait:gap-[2cqw] portrait:text-[4.2cqw]">
              <MapPin
                aria-hidden="true"
                className="size-[1.8cqw] text-brand-orange-text portrait:size-[5cqw]"
              />
              {diffusion.zone}
            </p>
            <p className="inline-flex items-center gap-[0.8cqw] font-label text-[1.1cqw] font-semibold tracking-[0.08em] text-white/70 portrait:gap-[2cqw] portrait:text-[3.2cqw]">
              <ShieldCheck aria-hidden="true" className="size-[1.5cqw] portrait:size-[4cqw]" />
              Contenu contrôlé avant diffusion
            </p>
          </div>
        </div>
      </SafeArea>

      {activation}
      <ProgressBar cycle={cycle} durationMs={durationMs} animate={animate} />
    </Fade>
  );
}

/** Time left for this spot. */
function ProgressBar({
  cycle,
  durationMs,
  animate,
}: {
  cycle: number;
  durationMs: number;
  animate: boolean;
}) {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-[2] h-1 bg-white/10">
      <div
        key={`p-${cycle}`}
        className="h-full origin-left bg-grad-brand"
        style={
          animate
            ? { animation: `progress-fill ${durationMs}ms linear both` }
            : { transform: "scaleX(1)" }
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Urgence (priority public-interest message)
// ---------------------------------------------------------------------------
export function UrgentSlide({ diffusion, animate }: { diffusion: Diffusion; animate: boolean }) {
  const theme = urgencyTheme(diffusion.urgencyLevel);
  const content = diffusion.content?.trim() ?? "";
  const longTitle = diffusion.title.length > 60 || content.length > 0;
  return (
    <Fade animate={animate}>
      <div
        aria-hidden="true"
        data-urgency={diffusion.urgencyLevel ?? "HIGH"}
        className={cx("absolute inset-0 overflow-hidden", theme.ground)}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(70% 80% at 30% 35%, ${theme.glow}, transparent 70%)`,
          }}
        />
        <div className="absolute inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(135deg,var(--color-white)_0_14px,transparent_14px_28px)] opacity-25" />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(135deg,var(--color-white)_0_14px,transparent_14px_28px)] opacity-25" />
      </div>

      <SafeArea>
        {/* Pulsing frame */}
        <div
          aria-hidden="true"
          className={cx(
            "absolute inset-[2cqw] rounded-[1.4cqw] border-[0.45cqw] portrait:inset-[4cqw] portrait:rounded-[3cqw] portrait:border-[1cqw]",
            theme.frame,
            animate ? "animate-pulse motion-reduce:animate-none" : "",
          )}
        />
        <div
          className={cx(
            "absolute inset-0 flex flex-col justify-between gap-[2cqw] p-[6cqw] portrait:p-[11cqw]",
            OVERLAY_CLEARANCE,
            theme.ink,
          )}
        >
          <div className="flex items-center gap-[1.4cqw] portrait:gap-[3.5cqw]">
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-[5cqw] shrink-0 items-center justify-center rounded-full portrait:size-[12cqw]",
                theme.disc,
              )}
            >
              <Siren className="size-[2.8cqw] portrait:size-[6.6cqw]" />
            </span>
            <div className="min-w-0">
              <p className="font-label text-[1.9cqw] leading-none font-bold tracking-[0.18em] uppercase portrait:text-[4.4cqw] portrait:leading-tight portrait:tracking-[0.12em]">
                {theme.kicker}
              </p>
              <p className="mt-[0.6cqw] text-[1.3cqw] font-medium opacity-90 portrait:mt-[1.2cqw] portrait:text-[3.4cqw]">
                Information d&apos;intérêt général
              </p>
            </div>
          </div>

          {/* max-w keeps the headline clear of the info panel (top right) on landscape screens. */}
          <div key={`${diffusion.emergencyId ?? "u"}-${diffusion.title}`} className="min-h-0">
            <p
              className={cx(
                "enter max-w-[76%] font-display leading-[1.03] font-extrabold tracking-[-0.02em] text-balance break-words portrait:max-w-full",
                longTitle
                  ? "text-[5.2cqw] portrait:text-[9.5cqw]"
                  : "text-[7cqw] portrait:text-[12cqw]",
              )}
            >
              {diffusion.title}
            </p>
            {content ? (
              <p
                className={cx(
                  "enter enter-1 mt-[1.6cqw] line-clamp-5 max-w-[80%] font-sans leading-snug font-medium whitespace-pre-line portrait:mt-[4cqw] portrait:max-w-full",
                  content.length > 220
                    ? "text-[1.9cqw] portrait:text-[4.4cqw]"
                    : "text-[2.6cqw] portrait:text-[5.6cqw]",
                )}
              >
                {content}
              </p>
            ) : null}
          </div>

          <div
            className={cx(
              "flex flex-wrap items-end justify-between gap-[2cqw] border-t-[0.15cqw] pt-[1.6cqw] portrait:flex-col portrait:items-start portrait:gap-[2.5cqw] portrait:border-t-[0.4cqw] portrait:pt-[4cqw]",
              theme.frame,
            )}
          >
            <p className="inline-flex items-center gap-[0.8cqw] text-[1.7cqw] font-semibold portrait:gap-[2cqw] portrait:text-[4.6cqw]">
              <MapPin aria-hidden="true" className="size-[2cqw] portrait:size-[5.2cqw]" />
              {diffusion.zone}
            </p>
            <p className="font-label text-[1.3cqw] font-semibold tracking-[0.08em] opacity-90 portrait:text-[3.3cqw]">
              Diffusion prioritaire sur les écrans de la zone
            </p>
          </div>
        </div>
      </SafeArea>
    </Fade>
  );
}

// ---------------------------------------------------------------------------
// Défaut (TPUB brand loop)
// ---------------------------------------------------------------------------
const BRAND_LINES = [
  SITE.tagline,
  "Réservation par zone et par créneau.",
  "Contenus contrôlés avant diffusion.",
] as const;

/** Backend default content first, then the brand lines (no duplicates). */
export function defaultLines(content?: string | null): string[] {
  const first = content?.trim();
  return first && !(BRAND_LINES as readonly string[]).includes(first)
    ? [first, ...BRAND_LINES]
    : [...BRAND_LINES];
}

function useRotatingIndex(length: number, everyMs: number, active: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % length), everyMs);
    return () => window.clearInterval(id);
  }, [active, length, everyMs]);
  return active ? index : 0;
}

export function DefaultSlide({
  zone,
  animate,
  notice,
  title,
  content,
}: {
  zone?: string | null;
  animate: boolean;
  /** Small strip at the bottom (e.g. offline fallback). */
  notice?: ReactNode;
  /** Default content sent by the backend (`tpub.diffusion.default-title`). */
  title?: string | null;
  /** `tpub.diffusion.default-content`: shown first in the rotating lines. */
  content?: string | null;
}) {
  const lines = defaultLines(content);
  const line = useRotatingIndex(lines.length, 3400, animate);
  return (
    <Fade animate={animate}>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-bg">
        <Image
          src="/images/led-closeup.jpg"
          alt=""
          fill
          sizes="100vw"
          priority
          className={cx("object-cover opacity-30", animate && "ken-burns")}
        />
        <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_45%,color-mix(in_srgb,var(--color-bg)_35%,transparent),var(--color-bg)_85%)]" />
        <div
          className="absolute -inset-[30%] bg-[radial-gradient(30%_32%_at_40%_45%,color-mix(in_srgb,var(--color-brand-orange)_22%,transparent),transparent_70%)] blur-3xl"
          style={driftStyle(animate, "aurora-a", 30)}
        />
        <div
          className="absolute -inset-[30%] bg-[radial-gradient(30%_32%_at_62%_58%,color-mix(in_srgb,var(--color-brand-blue)_30%,transparent),transparent_70%)] blur-3xl"
          style={driftStyle(animate, "aurora-b", 40)}
        />
        <div className="pixel-grid absolute inset-0 opacity-50 mix-blend-overlay" />
      </div>

      <SafeArea>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-[5cqw] text-center portrait:p-[8cqw]">
          <Image
            src="/brand/tpub.png"
            alt=""
            width={274}
            height={296}
            priority
            draggable={false}
            className="enter h-auto w-[9cqw] drop-shadow-[0_1.2cqw_3cqw_color-mix(in_srgb,var(--color-brand-orange)_35%,transparent)] portrait:w-[22cqw]"
          />
          <p className="enter enter-1 mt-[2.4cqw] font-display text-[8.4cqw] leading-none font-bold tracking-[0.2em] text-white portrait:mt-[6cqw] portrait:text-[17cqw]">
            TPUB
          </p>
          <p className="enter enter-2 mt-[1.4cqw] font-label text-[1.25cqw] font-semibold tracking-[0.32em] text-brand-orange-text uppercase portrait:mt-[3.5cqw] portrait:text-[2.9cqw] portrait:tracking-[0.2em]">
            {SITE.subline}
          </p>
          <div
            aria-hidden="true"
            className="hairline-tricolor enter enter-3 mt-[3cqw] w-[28cqw] portrait:mt-[8cqw] portrait:w-[60cqw]"
          />
          <p
            key={line}
            aria-live="off"
            className={cx(
              "mt-[2.6cqw] min-h-[3cqw] font-display text-[2.3cqw] font-medium tracking-[-0.01em] text-balance text-ink-soft portrait:mt-[6cqw] portrait:min-h-[14cqw] portrait:text-[5.2cqw] portrait:leading-snug",
              animate && "enter",
            )}
          >
            {lines[line] ?? lines[0]}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-[2cqw] p-[3.5cqw] text-[1.15cqw] text-muted portrait:flex-col portrait:items-center portrait:gap-[2cqw] portrait:p-[7cqw] portrait:text-[3.2cqw]">
          <span>{title?.trim() ? title : GROUP.mention}</span>
          {zone ? (
            <span className="inline-flex items-center gap-[0.6cqw] portrait:gap-[1.6cqw]">
              <MapPin aria-hidden="true" className="size-[1.3cqw] portrait:size-[3.6cqw]" />
              {zone}
            </span>
          ) : null}
        </div>
      </SafeArea>
      {notice}
    </Fade>
  );
}

// ---------------------------------------------------------------------------
// Boot & error states
// ---------------------------------------------------------------------------
export function BootSlide() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-bg p-8 text-center">
      <div aria-hidden="true" className="app-ground absolute inset-0" />
      <Image
        src="/brand/tpub.png"
        alt=""
        width={96}
        height={104}
        priority
        draggable={false}
        className="relative h-auto w-20 animate-pulse motion-reduce:animate-none"
      />
      <p className="relative font-label text-sm font-semibold tracking-[0.2em] text-muted uppercase">
        Connexion au réseau TPUB…
      </p>
    </div>
  );
}

const ERROR_ICONS = {
  offline: WifiOff,
  unreachable: CloudOff,
  "not-found": SearchX,
  invalid: ServerCrash,
  "rate-limited": Hourglass,
  server: ServerCrash,
} as const;

/**
 * Round 2 (§3.7): no device key for this Porteur (never paired, or revoked). No polling happens:
 * only an administrator's pairing link can start the player.
 */
export function UnpairedSlide({ supportId, revoked }: { supportId: number; revoked: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg p-6">
      <div aria-hidden="true" className="app-ground absolute inset-0" />
      <div aria-hidden="true" className="pixel-grid absolute inset-0 opacity-30" />
      <div className="relative flex w-full max-w-lg flex-col items-center rounded-panel border border-line-strong bg-surface/70 px-6 py-10 text-center shadow-card backdrop-blur-md sm:px-10">
        <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />
        <span
          aria-hidden="true"
          className="inline-flex size-16 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning"
        >
          <KeyRound className="size-7" />
        </span>
        <p className="mt-5 font-display text-2xl font-semibold text-ink-strong">
          Écran non appairé
        </p>
        <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">
          {revoked ? "La clé de cet écran a été révoquée ou remplacée. " : null}
          Demandez à un administrateur TPUB de générer le lien d&apos;appairage (Réseau › Porteur ›
          Appairer l&apos;écran).
        </p>
        <p className="mt-4 font-label text-[0.8125rem] text-muted-2 tabular">
          Écran n° {supportId}
        </p>
      </div>
    </div>
  );
}

export function OfflineSlide({
  error,
  secondsLeft,
  attempt,
  onRetry,
  retrying,
}: {
  error: PlayerErrorInfo;
  secondsLeft: number | null;
  attempt: number;
  onRetry: () => void;
  retrying: boolean;
}) {
  const Icon = ERROR_ICONS[error.kind];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg p-6">
      <div aria-hidden="true" className="app-ground absolute inset-0" />
      <div aria-hidden="true" className="pixel-grid absolute inset-0 opacity-30" />
      <div className="relative flex w-full max-w-lg flex-col items-center rounded-panel border border-line-strong bg-surface/70 px-6 py-10 text-center shadow-card backdrop-blur-md sm:px-10">
        <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />
        <span
          aria-hidden="true"
          className="inline-flex size-16 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger"
        >
          <Icon className="size-7" />
        </span>
        <p className="mt-5 font-display text-2xl font-semibold text-ink-strong">{error.title}</p>
        <p className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">{error.message}</p>
        <dl className="mt-6 grid w-full grid-cols-2 gap-3 text-left">
          <div className="rounded-control border border-line bg-black/20 px-4 py-3">
            <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-2 uppercase">
              Nouvelle tentative
            </dt>
            <dd className="mt-1 font-display text-lg font-semibold text-ink-strong tabular">
              {retrying ? "en cours…" : `dans ${formatCountdown(secondsLeft)}`}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-black/20 px-4 py-3">
            <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-2 uppercase">
              Tentatives
            </dt>
            <dd className="mt-1 font-display text-lg font-semibold text-ink-strong tabular">
              {attempt}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 inline-flex min-h-touch items-center gap-2 rounded-full border border-line-strong bg-white/5 px-5 font-label text-sm font-semibold text-ink transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={cx("size-4", retrying && "animate-spin")} />
          Réessayer maintenant
        </button>
      </div>
    </div>
  );
}
