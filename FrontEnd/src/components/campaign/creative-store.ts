"use client";

/**
 * Local « try it on the screen » previews of the network explorer's 3D studio: the file never
 * leaves the browser (object URLs in memory, forgotten on reload). Campaign media are real
 * uploads (`mediaApi.upload`, wizard step « Contenu ») and always win over these previews.
 */
import { useSyncExternalStore } from "react";

export type CreativeKind = "image" | "video";

export interface LocalCreative {
  url: string;
  kind: CreativeKind;
  name: string;
  size: number;
  mime: string;
}

const store = new Map<number, LocalCreative>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocalCreative(campaignId: number, file: File): LocalCreative {
  const previous = store.get(campaignId);
  if (previous) URL.revokeObjectURL(previous.url);
  const creative: LocalCreative = {
    url: URL.createObjectURL(file),
    kind: file.type.startsWith("video/") ? "video" : "image",
    name: file.name,
    size: file.size,
    mime: file.type,
  };
  store.set(campaignId, creative);
  emit();
  return creative;
}

export function clearLocalCreative(campaignId: number): void {
  const previous = store.get(campaignId);
  if (!previous) return;
  URL.revokeObjectURL(previous.url);
  store.delete(campaignId);
  emit();
}

/** Carries a preview over to another campaign id (« Changer de période » creates a copy). */
export function moveLocalCreative(fromId: number, toId: number): void {
  const previous = store.get(fromId);
  if (!previous || fromId === toId) return;
  const existing = store.get(toId);
  if (existing) URL.revokeObjectURL(existing.url);
  store.delete(fromId);
  store.set(toId, previous);
  emit();
}

export function useLocalCreative(campaignId: number | null): LocalCreative | null {
  return useSyncExternalStore(
    subscribe,
    () => (campaignId === null ? null : (store.get(campaignId) ?? null)),
    () => null,
  );
}

export const ACCEPTED_CREATIVE_TYPES = "image/*,video/*";
/** Soft guidance limit (the backend's multipart config, unused today, is 100 MB). */
export const CREATIVE_SIZE_HINT_BYTES = 100 * 1024 * 1024;

export type CreativeCheck = { ok: true } | { ok: false; message: string };

export function checkCreativeFile(file: Pick<File, "type" | "size">): CreativeCheck {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return { ok: false, message: "Format non pris en charge : choisissez une image ou une vidéo." };
  }
  if (file.size > CREATIVE_SIZE_HINT_BYTES) {
    return { ok: false, message: "Fichier trop lourd pour l'aperçu (100 Mo maximum)." };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}
