"use client";

import { Clapperboard, Image as ImageIcon, Palette, ScanEye, Sparkles } from "lucide-react";

import {
  colorSwatches,
  frameCaption,
  hasInsights,
  metricChips,
  ocrBadge,
  providerBadge,
} from "@/components/ai/image-metrics-model";
import { Badge } from "@/components/ui/badge";
import { asReportV2 } from "@/lib/api/endpoints-ia";
import type { AiReport } from "@/lib/api/types";
import type { AiMediaAnalysisV2, ImageMetrics } from "@/lib/api/types-ia";
import { cx } from "@/lib/cx";
import { formatNumber } from "@/lib/format";

/**
 * Round-2 additions of an AI report (docs/round2-contract.md §2.9): video thumbnail, frames with their OCR
 * text, image metrics, dominant colours, OCR engine and vision provider. Renders nothing for a report without
 * any of them.
 */
export function AiMediaInsights({
  report,
  className = "mt-6",
}: {
  report: AiReport;
  /** Spacing from the block above (none inside a gap layout). */
  className?: string;
}) {
  const v2 = asReportV2(report);
  const provider = providerBadge(v2);
  const media = v2.mediaAnalyses.filter(hasInsights);
  if (!provider && media.length === 0) return null;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-label text-[0.8125rem] font-semibold text-ink-soft">
          <ScanEye aria-hidden="true" className="size-4 text-brand-orange-text" />
          Analyse des visuels
        </p>
        <div className="flex flex-wrap gap-2">
          {provider ? (
            <Badge tone="violet" size="sm" icon={<Sparkles aria-hidden="true" />}>
              {provider}
            </Badge>
          ) : null}
          {v2.calibrationVersion !== null ? (
            <Badge tone="muted" size="sm" title="Seuils et poids des règles appliqués à cette analyse">
              Calibration v{v2.calibrationVersion}
            </Badge>
          ) : null}
        </div>
      </div>
      {media.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {media.map((m) => (
            <li key={m.mediaId}>
              <MediaCard media={m} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MediaCard({ media }: { media: AiMediaAnalysisV2 }) {
  const ocr = ocrBadge(media.ocrEngine, media.ocrConfidence);
  const video = media.contentType === "VIDEO";
  return (
    <article className="rounded-card border border-line bg-overlay-inset p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[0.875rem] font-semibold text-ink-strong">
          {video ? (
            <Clapperboard aria-hidden="true" className="size-4 shrink-0 text-muted" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
          )}
          <span className="min-w-0 break-all">{media.fileName || `Média #${media.mediaId}`}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ocr ? (
            <Badge tone={ocr.tone} size="sm">
              {ocr.label}
            </Badge>
          ) : null}
          {media.containerDurationSeconds !== null ? (
            <Badge tone="neutral" size="sm">
              Durée lue : {formatNumber(media.containerDurationSeconds)} s
            </Badge>
          ) : null}
        </div>
      </div>

      {media.videoSupported === false ? (
        <p className="mt-2 text-[0.8125rem] text-muted">
          Analyse vidéo impossible pour ce format (WebM) : préférez le MP4 pour une analyse image par
          image.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        {media.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.thumbnailUrl}
            alt={`Miniature de la vidéo ${media.fileName}`}
            loading="lazy"
            className="h-auto w-full max-w-[14rem] shrink-0 self-start rounded-control border border-line bg-surface object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {media.metrics ? <MetricsBlock metrics={media.metrics} video={video} /> : null}
        </div>
      </div>

      {media.frames.length > 0 ? (
        <div className="mt-4">
          <p className="text-[0.75rem] font-semibold tracking-wide text-muted uppercase">
            Images extraites
          </p>
          <ol aria-label="Images extraites de la vidéo" className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
            {media.frames.map((frame) => (
              <li
                key={frame.label}
                className="rounded-control border border-line bg-surface px-3 py-2 text-[0.8125rem]"
              >
                <p className="font-label font-semibold text-ink-soft tabular">
                  {frameCaption(frame.label, frame.positionSeconds)}
                </p>
                <p className={cx("mt-1 break-words", frame.extractedText ? "text-ink" : "text-muted")}>
                  {frame.extractedText?.trim() || "Aucun texte lu"}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

function MetricsBlock({ metrics, video }: { metrics: ImageMetrics; video: boolean }) {
  const swatches = colorSwatches(metrics.dominantColors);
  return (
    <>
      <ul
        aria-label={video ? "Mesures de la vidéo (image la plus défavorable)" : "Mesures du visuel"}
        className="flex flex-wrap gap-1.5"
      >
        {metricChips(metrics).map((chip) => (
          <li key={chip.key}>
            <Badge tone={chip.tone} size="sm" title={chip.hint}>
              {chip.label}
              <span className="sr-only"> ({chip.hint})</span>
            </Badge>
          </li>
        ))}
      </ul>
      {swatches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Palette aria-hidden="true" className="size-4 text-muted" />
          <ul aria-label="Couleurs dominantes" className="flex flex-wrap items-center gap-1.5">
            {swatches.map((c) => (
              <li key={c.hex} className="flex items-center gap-1 text-[0.75rem] text-muted tabular">
                <span
                  role="img"
                  aria-label={c.label}
                  title={c.label}
                  className="inline-block size-5 rounded-full border border-line-strong"
                  style={{ backgroundColor: c.hex }}
                />
                <span aria-hidden="true">{Math.round(c.share * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
