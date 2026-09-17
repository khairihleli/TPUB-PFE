"use client";

import { ImageUp } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";

import { MEDIA_ACCEPT } from "@/components/campaign/media-model";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

export interface CreativeDropzoneProps {
  /** Files dropped or picked (validation is the caller's job). */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Why the zone is disabled (shown instead of the hint). */
  disabledReason?: string | null;
  compact?: boolean;
  /** Error under the zone (e.g. rejected file). */
  error?: string | null;
  className?: string;
}

/** Drag & drop or file picker for campaign media (images, banners, videos). */
export function CreativeDropzone({
  onFiles,
  disabled = false,
  disabledReason,
  compact = false,
  error,
  className,
}: CreativeDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const errorId = useId();

  const accept = (list: FileList | null | undefined) => {
    if (disabled || !list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="media-file-input"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "relative flex flex-col items-center justify-center gap-3 rounded-card border border-dashed text-center transition-[border-color,background-color] duration-200",
          compact ? "px-5 py-7" : "px-6 py-10 sm:py-12",
          disabled
            ? "border-line bg-overlay-subtle opacity-70"
            : dragging
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
            Glissez vos visuels ici
          </p>
          <p id={hintId} className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
            {disabled && disabledReason
              ? disabledReason
              : "Images JPEG, PNG, WebP ou GIF (10 Mo) · vidéos MP4 ou WebM (50 Mo) · 5 fichiers maximum"}
          </p>
        </div>
        <Button
          variant="secondary"
          size={compact ? "sm" : "md"}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-describedby={cx(hintId, error ? errorId : undefined)}
        >
          Choisir des fichiers
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2.5 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
