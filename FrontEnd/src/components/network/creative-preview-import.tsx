"use client";

import { FileImage, FileVideo, ImageUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import {
  ACCEPTED_CREATIVE_TYPES,
  checkCreativeFile,
  clearLocalCreative,
  formatFileSize,
  setLocalCreative,
  useLocalCreative,
} from "@/components/campaign/creative-store";
import { Button } from "@/components/ui/button";
import type { CampaignResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";

/** Key of the explorer's local « try it on the screen » preview in the creative store. */
export const EXPLORER_CREATIVE_KEY = 0;

export interface StudioCreative {
  url: string;
  kind: "image" | "video";
  name: string;
  /** Local previews only (uploaded media are summarised by the campaign). */
  size: number | null;
}

/**
 * Creative shown on the studio screen: the chosen campaign's uploaded media (served from
 * /uploads) wins; otherwise a local preview imported in the explorer (never uploaded).
 */
export interface StudioCreativeState {
  creative: StudioCreative | null;
  source: "campaign" | "explorer" | null;
  campaignId: number | null;
}

export function studioCreativeOf(
  campaign: Pick<CampaignResponse, "id" | "name" | "mediaUrl" | "mediaType"> | null,
  local: StudioCreative | null,
): StudioCreativeState {
  if (campaign?.mediaUrl) {
    return {
      creative: {
        url: campaign.mediaUrl,
        kind: campaign.mediaType === "VIDEO" ? "video" : "image",
        name: `Visuel de « ${campaign.name} »`,
        size: null,
      },
      source: "campaign",
      campaignId: campaign.id,
    };
  }
  return { creative: local, source: local ? "explorer" : null, campaignId: campaign?.id ?? null };
}

export function useStudioCreative(
  campaign: Pick<CampaignResponse, "id" | "name" | "mediaUrl" | "mediaType"> | null,
): StudioCreativeState {
  const local = useLocalCreative(EXPLORER_CREATIVE_KEY);
  return studioCreativeOf(campaign, local);
}

export interface CreativePreviewImportProps {
  creative: StudioCreative | null;
  source: "campaign" | "explorer" | null;
  /** Chosen campaign (link to its « Contenu » step). */
  campaignId?: number | null;
  className?: string;
}

/**
 * Compact « Importer un visuel » control for the 3D preview. A local preview never leaves the
 * browser; the media actually diffused are uploaded in the campaign's « Contenu » step.
 */
export function CreativePreviewImport({
  creative,
  source,
  campaignId = null,
  className,
}: CreativePreviewImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const errorId = useId();

  const accept = (file: File | undefined) => {
    if (!file) return;
    const check = checkCreativeFile(file);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    const saved = setLocalCreative(EXPLORER_CREATIVE_KEY, file);
    setAnnounce(`Visuel appliqué sur l'écran du Porteur : ${saved.name}.`);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_CREATIVE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        className={cx(
          "flex flex-wrap items-center gap-3 rounded-card border p-3",
          creative
            ? "border-line bg-overlay-inset"
            : "border-dashed border-line-strong bg-overlay-subtle",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-control border",
            creative
              ? "border-blue-line bg-blue-soft text-brand-blue-text"
              : "border-orange-line bg-orange-soft text-brand-orange-text",
          )}
        >
          {creative ? (
            creative.kind === "video" ? (
              <FileVideo className="size-[18px]" />
            ) : (
              <FileImage className="size-[18px]" />
            )
          ) : (
            <ImageUp className="size-[18px]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {creative ? (
            <>
              <p className="truncate font-label text-[0.8125rem] font-semibold text-ink-strong">
                {creative.name}
              </p>
              <p className="text-[0.75rem] text-muted">
                {creative.kind === "video" ? "Vidéo" : "Image"}
                {creative.size !== null ? ` · ${formatFileSize(creative.size)}` : ""}
                {source === "campaign" ? " · média de la campagne" : " · aperçu local"}
              </p>
            </>
          ) : (
            <>
              <p className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                Votre visuel sur l&apos;écran
              </p>
              <p className="text-[0.75rem] text-muted">Image ou vidéo · 16:9 ou 9:16 · 10 s</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {source === "campaign" && campaignId !== null ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={routes.espace.wizard(campaignId, "contenu")}>Gérer les médias</Link>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              aria-describedby={error ? errorId : undefined}
            >
              {creative ? "Remplacer" : "Importer un visuel"}
            </Button>
          )}
          {source === "explorer" ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 aria-hidden="true" />}
              onClick={() => {
                clearLocalCreative(EXPLORER_CREATIVE_KEY);
                setAnnounce("Visuel retiré de l'aperçu.");
              }}
            >
              Retirer
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
        {source === "campaign"
          ? "Aperçu du premier média déposé sur la campagne choisie."
          : "Aperçu local : le fichier ne quitte pas votre navigateur. Pour le diffuser, déposez-le dans l'étape « Contenu » de votre campagne."}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
