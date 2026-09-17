"use client";

import { CircleAlert, FileVideo, ImageIcon, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  checkMediaFile,
  describeMedia,
  formatFileSize,
  readVideoDuration,
} from "@/components/campaign/media-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { mediaApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { MediaFileResponse } from "@/lib/api/types";
import { MEDIA_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { useSignedMediaSrc } from "@/lib/use-signed-media";

// ---------------------------------------------------------------------------
// Upload queue
// ---------------------------------------------------------------------------
export interface UploadItem {
  key: string;
  name: string;
  size: number;
  /** 0..1 */
  progress: number;
  status: "uploading" | "error";
  error?: string;
}

export interface MediaUploads {
  uploads: UploadItem[];
  /** Validation message of the last rejected file (client pre-check). */
  rejection: string | null;
  upload: (files: File[], options: { banner: boolean }) => Promise<void>;
  dismiss: (key: string) => void;
}

let uploadSeq = 0;

/**
 * Sequential uploads with progress (POST multipart). Each file is pre-checked (type, size, 5 files
 * max), videos send their duration, images optionally go up as banners. Successful uploads are
 * reported through `onUploaded`; failures stay listed with their French error.
 */
export function useMediaUploads(
  campaignId: number,
  existingCount: number,
  onUploaded: (media: MediaFileResponse) => void,
): MediaUploads {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [rejection, setRejection] = useState<string | null>(null);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  const patch = (key: string, next: Partial<UploadItem>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...next } : u)));

  const upload = useCallback(
    async (files: File[], { banner }: { banner: boolean }) => {
      setRejection(null);
      let count = existingCount;
      for (const file of files) {
        const check = checkMediaFile(file, { existingCount: count });
        if (!check.ok) {
          setRejection(`${file.name} : ${check.message}`);
          continue;
        }
        count += 1;
        const key = `upload-${++uploadSeq}`;
        setUploads((list) => [
          ...list,
          { key, name: file.name, size: file.size, progress: 0, status: "uploading" },
        ]);
        try {
          const durationSeconds = check.family === "video" ? await readVideoDuration(file) : null;
          const media = await mediaApi.upload(
            campaignId,
            file,
            { kind: check.family === "image" && banner ? "BANNER" : null, durationSeconds },
            { onProgress: (fraction) => patch(key, { progress: fraction }) },
          );
          setUploads((list) => list.filter((u) => u.key !== key));
          onUploadedRef.current(media);
        } catch (e) {
          count -= 1;
          patch(key, { status: "error", error: presentError(e).message });
        }
      }
    },
    [campaignId, existingCount],
  );

  const dismiss = useCallback(
    (key: string) => setUploads((list) => list.filter((u) => u.key !== key)),
    [],
  );

  return { uploads, rejection, upload, dismiss };
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------
/**
 * One media preview. Round 2: the URL is signed and expires; a load error refreshes the media list
 * once (fresh signature), a second failure shows « Aperçu indisponible ».
 */
export function GalleryMediaPreview({
  media,
  playable,
}: {
  media: MediaFileResponse;
  playable: boolean;
}) {
  const { src, failed, onError } = useSignedMediaSrc(media.url);
  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={`Aperçu indisponible : « ${media.fileName} »`}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-muted"
      >
        <CircleAlert aria-hidden="true" className="size-5" />
        <span className="text-[0.75rem] leading-snug">Aperçu indisponible. Rechargez la page.</span>
      </div>
    );
  }
  return media.fileType === "VIDEO" ? (
    <video
      src={src}
      className="absolute inset-0 size-full object-contain"
      controls={playable}
      muted
      playsInline
      preload="metadata"
      aria-label={`Vidéo « ${media.fileName} »`}
      onError={onError}
    />
  ) : (
    // Same-origin signed /uploads URL: next/image optimisation is not needed here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`Visuel « ${media.fileName} »`}
      loading="lazy"
      className="absolute inset-0 size-full object-contain"
      onError={onError}
    />
  );
}

export interface MediaGalleryProps {
  campaignId: number;
  media: readonly MediaFileResponse[];
  uploads?: readonly UploadItem[];
  onDismissUpload?: (key: string) => void;
  /** Highlighted media (preview). */
  selectedId?: number | null;
  onSelect?: (media: MediaFileResponse) => void;
  /** Deletion allowed (BROUILLON owner). */
  editable?: boolean;
  onDeleted?: (mediaId: number) => void;
  /** Read-only players (detail page): videos get native controls. */
  playable?: boolean;
  className?: string;
}

export function MediaGallery({
  campaignId,
  media,
  uploads = [],
  onDismissUpload,
  selectedId = null,
  onSelect,
  editable = false,
  onDeleted,
  playable = false,
  className,
}: MediaGalleryProps) {
  const [toDelete, setToDelete] = useState<MediaFileResponse | null>(null);

  return (
    <>
      <ul
        aria-label="Médias de la campagne"
        className={cx("grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2", className)}
      >
        {media.map((m) => {
          const selected = selectedId === m.id;
          const video = m.fileType === "VIDEO";
          return (
            <li
              key={m.id}
              className={cx(
                "flex min-w-0 flex-col overflow-hidden rounded-card border bg-surface",
                selected
                  ? "border-brand-blue-text/60 ring-1 ring-brand-blue-text/40"
                  : "border-line",
              )}
            >
              <div className="relative aspect-video bg-bg">
                <GalleryMediaPreview media={m} playable={playable} />
                <Badge
                  tone={m.fileType === "BANNER" ? "cat-3" : video ? "cat-1" : "cat-2"}
                  size="sm"
                  className="absolute top-2 left-2"
                  icon={video ? <FileVideo aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                >
                  {MEDIA_TYPE_LABEL[m.fileType]}
                </Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p
                  className="truncate font-label text-[0.875rem] font-semibold text-ink-strong"
                  title={m.fileName}
                >
                  {m.fileName}
                </p>
                <p className="text-[0.75rem] leading-snug text-muted">
                  {describeMedia(m, MEDIA_TYPE_LABEL)}
                </p>
                {onSelect || editable ? (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {onSelect ? (
                      <Button
                        variant={selected ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={selected}
                        onClick={() => onSelect(m)}
                      >
                        {selected ? "Aperçu affiché" : "Voir l'aperçu"}
                        <span className="sr-only"> : {m.fileName}</span>
                      </Button>
                    ) : null}
                    {editable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 aria-hidden="true" />}
                        onClick={() => setToDelete(m)}
                      >
                        Supprimer<span className="sr-only"> : {m.fileName}</span>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}

        {uploads.map((u) => (
          <li
            key={u.key}
            className={cx(
              "flex min-w-0 flex-col justify-center gap-2 rounded-card border p-4",
              u.status === "error" ? "border-danger/35 bg-danger/[0.04]" : "border-line bg-surface",
            )}
          >
            <p
              className="truncate font-label text-[0.875rem] font-semibold text-ink-strong"
              title={u.name}
            >
              {u.name}
            </p>
            <p className="text-[0.75rem] text-muted">{formatFileSize(u.size)}</p>
            {u.status === "uploading" ? (
              <>
                <div
                  role="progressbar"
                  aria-label={`Envoi de ${u.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(u.progress * 100)}
                  className="h-2 overflow-hidden rounded-full bg-overlay-hover"
                >
                  <div
                    className="h-full rounded-full bg-brand-blue-text transition-[width] duration-200"
                    style={{ width: `${Math.round(u.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[0.75rem] text-ink-soft tabular">
                  Envoi… {Math.round(u.progress * 100)} %
                </p>
              </>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p role="alert" className="flex gap-1.5 text-[0.8125rem] leading-snug text-danger">
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {u.error}
                </p>
                {onDismissUpload ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Retirer ${u.name}`}
                    onClick={() => onDismissUpload(u.key)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={toDelete ? `Supprimer « ${toDelete.fileName} » ?` : "Supprimer le média ?"}
        description="Le fichier est définitivement retiré de la campagne."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!toDelete) return;
          await mediaApi.remove(campaignId, toDelete.id);
          onDeleted?.(toDelete.id);
        }}
      />
    </>
  );
}
