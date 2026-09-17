/**
 * Campaign media rules shared by the upload step and the detail page (contract §2.3): accepted
 * types, size limits, 5 files per campaign, BANNER only for images, duration for videos.
 * Pure helpers (no React) except `readVideoDuration`, which needs a browser <video>.
 */
import type { MediaFileResponse, MediaFileType } from "@/lib/api/types";

export const MEDIA_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MEDIA_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const MEDIA_ACCEPT = [...MEDIA_IMAGE_TYPES, ...MEDIA_VIDEO_TYPES].join(",");

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_FILES = 5;
/** Backend bounds of `durationSeconds`. */
export const MIN_VIDEO_SECONDS = 1;
export const MAX_VIDEO_SECONDS = 600;
/** Beyond this the AI lowers the quality score (« vidéo trop longue pour un Porteur »). */
export const RECOMMENDED_MAX_VIDEO_SECONDS = 60;

export type MediaFamily = "image" | "video";

export function mediaFamily(mime: string): MediaFamily | null {
  if ((MEDIA_IMAGE_TYPES as readonly string[]).includes(mime)) return "image";
  if ((MEDIA_VIDEO_TYPES as readonly string[]).includes(mime)) return "video";
  return null;
}

export type MediaCheck = { ok: true; family: MediaFamily } | { ok: false; message: string };

/** Client pre-check mirroring the backend (the server still sniffs the bytes). */
export function checkMediaFile(
  file: Pick<File, "type" | "size">,
  { existingCount = 0 }: { existingCount?: number } = {},
): MediaCheck {
  if (existingCount >= MAX_MEDIA_FILES) {
    return {
      ok: false,
      message: `Nombre maximal de médias atteint (${MAX_MEDIA_FILES} par campagne).`,
    };
  }
  const family = mediaFamily(file.type);
  if (!family) {
    return {
      ok: false,
      message:
        "Format non pris en charge : JPEG, PNG, WebP ou GIF pour une image, MP4 ou WebM pour une vidéo.",
    };
  }
  if (family === "image" && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Image trop lourde : 10 Mo maximum." };
  }
  if (family === "video" && file.size > MAX_VIDEO_BYTES) {
    return { ok: false, message: "Vidéo trop lourde : 50 Mo maximum." };
  }
  return { ok: true, family };
}

/** Rounded duration accepted by the backend, or null when unknown / out of bounds. */
export function normalizeDuration(seconds: number | null | undefined): number | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const rounded = Math.round(seconds);
  if (rounded < MIN_VIDEO_SECONDS) return MIN_VIDEO_SECONDS;
  return rounded > MAX_VIDEO_SECONDS ? null : rounded;
}

/** Reads a local video's duration from its metadata (null when unreadable). */
export function readVideoDuration(file: Blob): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(normalizeDuration(video.duration));
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 5000);
    video.src = url;
  });
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds))
    return "durée inconnue";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m} min` : `${m} min ${String(rest).padStart(2, "0")} s`;
}

export type ScreenFormat = "paysage" | "portrait" | "carre" | "autre";

/** 16:9, 9:16 or 1:1 within ±15 % (same tolerance as the AI « format inadapté » rule). */
export function screenFormatOf(width: number | null, height: number | null): ScreenFormat | null {
  if (!width || !height) return null;
  const ratio = width / height;
  const near = (target: number) => Math.abs(ratio - target) / target <= 0.15;
  if (near(16 / 9)) return "paysage";
  if (near(9 / 16)) return "portrait";
  if (near(1)) return "carre";
  return "autre";
}

const FORMAT_LABEL: Record<ScreenFormat, string> = {
  paysage: "16:9",
  portrait: "9:16",
  carre: "1:1",
  autre: "format libre",
};

/** « Image · 1920 × 1080 px (16:9) · 1,2 Mo » */
export function describeMedia(
  media: Pick<
    MediaFileResponse,
    "fileType" | "widthPx" | "heightPx" | "durationSeconds" | "fileSizeBytes"
  >,
  typeLabel: Record<MediaFileType, string>,
): string {
  const parts: string[] = [typeLabel[media.fileType]];
  if (media.widthPx && media.heightPx) {
    const format = screenFormatOf(media.widthPx, media.heightPx);
    parts.push(
      `${media.widthPx} × ${media.heightPx} px${format ? ` (${FORMAT_LABEL[format]})` : ""}`,
    );
  }
  if (media.fileType === "VIDEO") parts.push(formatDuration(media.durationSeconds));
  parts.push(formatFileSize(media.fileSizeBytes));
  return parts.join(" · ");
}

/** Media kind for the preview frame. */
export function previewKind(fileType: MediaFileType): "image" | "video" {
  return fileType === "VIDEO" ? "video" : "image";
}
