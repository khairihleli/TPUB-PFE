"use client";

import { FileImage, FileVideo, ImageUp, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import {
  ACCEPTED_CREATIVE_TYPES,
  checkCreativeFile,
  clearLocalCreative,
  formatFileSize,
  type LocalCreative,
  setLocalCreative,
  useLocalCreative,
} from "@/components/campaign/creative-store";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

/**
 * Creative preview key used before a campaign is chosen. Campaign ids are > 0, so 0 never
 * collides with a real campaign in the shared creative store.
 */
export const EXPLORER_CREATIVE_KEY = 0;

let lastExplorerFile: File | null = null;

/** Copies the explorer creative onto a campaign that has none yet (after a booking). */
export function adoptExplorerCreative(campaignId: number, campaignHasCreative: boolean): void {
  if (campaignHasCreative || !lastExplorerFile || campaignId <= 0) return;
  setLocalCreative(campaignId, lastExplorerFile);
}

/**
 * Creative shown on the studio screen: the chosen campaign's preview (e.g. picked in the wizard)
 * wins, otherwise the one imported in the explorer.
 */
export interface StudioCreativeState {
  creative: LocalCreative | null;
  campaignCreative: LocalCreative | null;
  source: "campaign" | "explorer" | null;
  storeKey: number;
}

export function useStudioCreative(campaignId: number | null): StudioCreativeState {
  const campaignCreative = useLocalCreative(campaignId);
  const explorerCreative = useLocalCreative(EXPLORER_CREATIVE_KEY);
  const creative = campaignCreative ?? explorerCreative;
  return {
    creative,
    campaignCreative,
    source: campaignCreative ? "campaign" : explorerCreative ? "explorer" : null,
    storeKey: campaignCreative && campaignId !== null ? campaignId : EXPLORER_CREATIVE_KEY,
  };
}

export interface CreativePreviewImportProps {
  creative: LocalCreative | null;
  source: "campaign" | "explorer" | null;
  /** Store key to write/clear (campaign id when the preview comes from it). */
  storeKey: number;
  className?: string;
}

/** Compact « Importer un visuel » control. Local preview only, nothing is uploaded. */
export function CreativePreviewImport({
  creative,
  source,
  storeKey,
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
    if (storeKey === EXPLORER_CREATIVE_KEY) lastExplorerFile = file;
    const saved = setLocalCreative(storeKey, file);
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
                {creative.kind === "video" ? "Vidéo" : "Image"} · {formatFileSize(creative.size)}
                {source === "campaign" ? " · visuel de la campagne" : " · aperçu local"}
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            aria-describedby={error ? errorId : undefined}
          >
            {creative ? "Remplacer" : "Importer un visuel"}
          </Button>
          {creative ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 aria-hidden="true" />}
              onClick={() => {
                clearLocalCreative(storeKey);
                if (storeKey === EXPLORER_CREATIVE_KEY) lastExplorerFile = null;
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
        Aperçu local : le fichier ne quitte pas votre navigateur. Le dépôt de fichiers sera activé
        prochainement — votre conseiller TPUB récupère le visuel après validation.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
