"use client";

import { FileImage, FileVideo, ImageUp, Trash2 } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";

import {
  ACCEPTED_CREATIVE_TYPES,
  checkCreativeFile,
  clearLocalCreative,
  formatFileSize,
  setLocalCreative,
  useLocalCreative,
} from "@/components/campaign/creative-store";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

export interface CreativeDropzoneProps {
  campaignId: number;
  compact?: boolean;
  className?: string;
}

/**
 * Drag & drop or file picker for a LOCAL preview. Nothing is uploaded (no endpoint):
 * the notice next to it says so.
 */
export function CreativeDropzone({
  campaignId,
  compact = false,
  className,
}: CreativeDropzoneProps) {
  const creative = useLocalCreative(campaignId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const hintId = useId();
  const errorId = useId();

  const accept = (file: File | undefined) => {
    if (!file) return;
    const check = checkCreativeFile(file);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    const saved = setLocalCreative(campaignId, file);
    setAnnounce(`Aperçu prêt : ${saved.name}.`);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files[0]);
  };

  const openPicker = () => inputRef.current?.click();

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

      {creative ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-overlay-inset p-3.5">
          <span
            aria-hidden="true"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-blue-line bg-blue-soft text-brand-blue-text"
          >
            {creative.kind === "video" ? (
              <FileVideo className="size-5" />
            ) : (
              <FileImage className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-label text-[0.875rem] font-semibold text-ink-strong">
              {creative.name}
            </p>
            <p className="text-[0.8125rem] text-muted">
              {creative.kind === "video" ? "Vidéo" : "Image"} · {formatFileSize(creative.size)} ·
              aperçu local
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={openPicker}>
              Remplacer
            </Button>
            <Button
              variant="ghost"
              size="sm"

              iconLeft={<Trash2 aria-hidden="true" />}
              onClick={() => {
                clearLocalCreative(campaignId);
                setAnnounce("Aperçu retiré.");
              }}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "relative flex flex-col items-center justify-center gap-3 rounded-card border border-dashed text-center transition-[border-color,background-color] duration-200",
            compact ? "px-5 py-7" : "px-6 py-12 sm:py-14",
            dragging
              ? "border-brand-blue-text bg-blue-soft"
              : "border-line-strong bg-overlay-subtle hover:border-muted-2",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex items-center justify-center rounded-full border border-orange-line bg-orange-soft text-brand-orange-text",
              compact ? "size-11" : "size-14",
            )}
          >
            <ImageUp className={compact ? "size-5" : "size-6"} />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-ink-strong">
              Glissez votre visuel ici
            </p>
            <p id={hintId} className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              Image ou vidéo · formats 16:9 ou 9:16 · 10 s par passage
            </p>
          </div>
          <Button
            variant="secondary"

            size={compact ? "sm" : "md"}
            onClick={openPicker}
            aria-describedby={cx(hintId, error ? errorId : undefined)}
          >
            Choisir un fichier
          </Button>
        </div>
      )}

      {error ? (
        <p id={errorId} role="alert" className="mt-2.5 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
