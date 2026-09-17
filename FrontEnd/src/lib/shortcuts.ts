/**
 * Keyboard shortcut grammar, matching rules and the documentation registry (UX-PLAN §5.2).
 * Map, Studio 3D and moderation sections MIRROR existing handlers (they are not re-bound here).
 * Key strings: strokes separated by spaces for sequences ("g d"), modifiers joined with "+"
 * ("mod+k" = ⌘K on Apple, Ctrl+K elsewhere). Single keys: "?", "/", "n", "j", "escape".
 */

export interface KeyStroke {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export const SEQUENCE_TIMEOUT_MS = 1200;
export const SINGLE_KEY_STORAGE_KEY = "tpub:shortcuts:single-key-off";

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  échap: "escape",
  return: "enter",
  space: " ",
  slash: "/",
};

export function parseStroke(stroke: string): KeyStroke {
  const parts = stroke
    .trim()
    .toLowerCase()
    .split("+")
    .filter((p) => p !== "");
  // "shift++" style is not supported; "+" as key is written "plus".
  let key = parts.pop() ?? "";
  if (key === "plus") key = "+";
  key = KEY_ALIASES[key] ?? key;
  return {
    key,
    mod:
      parts.includes("mod") ||
      parts.includes("ctrl") ||
      parts.includes("meta") ||
      parts.includes("cmd"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  };
}

/** "g d" → two strokes; "mod+k" → one stroke. */
export function parseKeys(keys: string): KeyStroke[] {
  return keys.trim().split(/\s+/).filter(Boolean).map(parseStroke);
}

/** A single-key shortcut has one stroke and no modifier (Shift alone allowed, e.g. « ? »). */
export function isSingleKey(keys: string): boolean {
  const strokes = parseKeys(keys);
  return strokes.every((s) => !s.mod && !s.alt);
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export function matchesStroke(e: KeyEventLike, stroke: KeyStroke): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (key !== stroke.key) return false;
  const mod = e.metaKey || e.ctrlKey;
  if (stroke.mod !== mod) return false;
  if (stroke.alt !== e.altKey) return false;
  // Shift is implied by printable symbols such as « ? »: only enforce it when declared.
  if (stroke.shift && !e.shiftKey) return false;
  return true;
}

/** Inputs, textareas, selects, contenteditable and ARIA textboxes/comboboxes. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(
      type,
    );
  }
  return el.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]') !== null;
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Display tokens for <Kbd>: "mod+k" → ["⌘", "K"] (Apple) or ["Ctrl", "K"]. */
export function keyLabels(keys: string, apple = isApplePlatform()): string[][] {
  return parseKeys(keys).map((s) => {
    const out: string[] = [];
    if (s.mod) out.push(apple ? "⌘" : "Ctrl");
    if (s.alt) out.push(apple ? "⌥" : "Alt");
    if (s.shift) out.push("Maj");
    out.push(displayKey(s.key));
    return out;
  });
}

function displayKey(key: string): string {
  switch (key) {
    case "escape":
      return "Échap";
    case "enter":
      return "Entrée";
    case " ":
      return "Espace";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "pageup":
      return "Page ↑";
    case "pagedown":
      return "Page ↓";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/** Accessible text: "mod+k" → « Ctrl K », "g d" → « G puis D ». */
export function keysAriaLabel(keys: string, apple = isApplePlatform()): string {
  return keyLabels(keys, apple)
    .map((stroke) => stroke.join(" "))
    .join(" puis ");
}

export function singleKeyShortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SINGLE_KEY_STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setSingleKeyShortcutsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(SINGLE_KEY_STORAGE_KEY);
    else window.localStorage.setItem(SINGLE_KEY_STORAGE_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Page search (« / »): a page with a FilterBar search takes « / » for itself
// ---------------------------------------------------------------------------

const pageSearches: (() => void)[] = [];

/** Registers the focus function of the page's search field. Returns the unregister function. */
export function registerPageSearch(focus: () => void): () => void {
  pageSearches.push(focus);
  return () => {
    const i = pageSearches.lastIndexOf(focus);
    if (i >= 0) pageSearches.splice(i, 1);
  };
}

/** Focuses the most recently registered page search. False when the page has none. */
export function focusPageSearch(): boolean {
  const focus = pageSearches[pageSearches.length - 1];
  if (!focus) return false;
  focus();
  return true;
}

// ---------------------------------------------------------------------------
// Documentation registry
// ---------------------------------------------------------------------------

export interface ShortcutDoc {
  keys: string;
  label: string;
}

export interface ShortcutSectionDoc {
  id: string;
  title: string;
  items: readonly ShortcutDoc[];
  /** Only listed when the pathname starts with one of these (global sections: undefined). */
  routes?: readonly string[];
}

export type ShellVariant = "espace" | "admin";

export interface NavSequence {
  keys: string;
  label: string;
  href: string;
}

export const NAV_SEQUENCES: Readonly<Record<ShellVariant, readonly NavSequence[]>> = {
  espace: [
    { keys: "g d", label: "Tableau de bord", href: "/espace" },
    { keys: "g c", label: "Campagnes", href: "/espace/campagnes" },
    { keys: "g r", label: "Réseau & Studio 3D", href: "/espace/reseau" },
    { keys: "g v", label: "Réservations", href: "/espace/reservations" },
    { keys: "g s", label: "Statistiques", href: "/espace/statistiques" },
  ],
  admin: [
    { keys: "g a", label: "Vue d'ensemble", href: "/admin" },
    { keys: "g o", label: "Supervision", href: "/admin/supervision" },
    { keys: "g b", label: "Approbations", href: "/admin/approbations" },
    { keys: "g m", label: "Modération", href: "/admin/moderation" },
    { keys: "g r", label: "Réseau", href: "/admin/reseau" },
    { keys: "g u", label: "Messages prioritaires", href: "/admin/urgences" },
    { keys: "g v", label: "Réservations", href: "/admin/reservations" },
    { keys: "g s", label: "Statistiques", href: "/admin/statistiques" },
    { keys: "g c", label: "Carte de chaleur", href: "/admin/carte-chaleur" },
    { keys: "g q", label: "Qualité IA", href: "/admin/ia-qualite" },
    { keys: "g n", label: "Notifications", href: "/admin/notifications" },
    { keys: "g j", label: "Journal", href: "/admin/journal" },
    { keys: "g e", label: "Utilisateurs", href: "/admin/utilisateurs" },
    { keys: "g i", label: "Règles IA", href: "/admin/regles-ia" },
  ],
};

export function globalShortcutSection(variant: ShellVariant): ShortcutSectionDoc {
  return {
    id: "global",
    title: "Partout",
    items: [
      { keys: "mod+k", label: "Ouvrir la recherche et les commandes" },
      { keys: "shift+?", label: "Afficher les raccourcis clavier" },
      { keys: "/", label: "Rechercher dans la page (ou ouvrir la recherche)" },
      ...(variant === "espace" ? [{ keys: "n", label: "Nouvelle campagne" }] : []),
    ],
  };
}

export function navigationShortcutSection(variant: ShellVariant): ShortcutSectionDoc {
  return {
    id: "navigation",
    title: "Aller à",
    items: NAV_SEQUENCES[variant].map((s) => ({ keys: s.keys, label: s.label })),
  };
}

/** Mirrors `network-map-client.tsx` (focus inside the map). */
export const MAP_SHORTCUT_SECTION: ShortcutSectionDoc = {
  id: "map",
  title: "Carte du réseau",
  routes: ["/espace/reseau", "/admin/reseau"],
  items: [
    { keys: "plus", label: "Zoomer" },
    { keys: "-", label: "Dézoomer" },
    { keys: "m", label: "Mesurer une distance" },
    { keys: "c", label: "Zone de chalandise" },
    { keys: "f", label: "Filtres" },
    { keys: "l", label: "Légende" },
    { keys: "escape", label: "Fermer le panneau ou l'outil" },
  ],
};

/** Mirrors `porteur-studio-canvas.tsx` (focus on the 3D stage). */
export const STUDIO_SHORTCUT_SECTION: ShortcutSectionDoc = {
  id: "studio",
  title: "Studio 3D",
  routes: ["/espace/reseau", "/admin/reseau"],
  items: [
    { keys: "1", label: "Vue orbite" },
    { keys: "2", label: "Vue piéton" },
    { keys: "3", label: "Vue conducteur" },
    { keys: "4", label: "Vue drone" },
    { keys: "5", label: "Face écran" },
    { keys: "r", label: "Recentrer la vue" },
    { keys: "plus", label: "Rapprocher" },
    { keys: "-", label: "Éloigner" },
    { keys: "arrowleft", label: "Tourner (Maj : plus vite)" },
    { keys: "escape", label: "Fermer le point d'intérêt" },
  ],
};

/** Moderation review (package D registers the handlers with useShortcut). */
export const MODERATION_SHORTCUT_SECTION: ShortcutSectionDoc = {
  id: "moderation",
  title: "Examen de modération",
  routes: ["/admin/moderation"],
  items: [
    { keys: "j", label: "Campagne suivante" },
    { keys: "k", label: "Campagne précédente" },
    { keys: "v", label: "Valider" },
    { keys: "r", label: "Refuser" },
    { keys: "escape", label: "Fermer l'examen" },
  ],
};

export const CONTEXTUAL_SHORTCUT_SECTIONS: readonly ShortcutSectionDoc[] = [
  MAP_SHORTCUT_SECTION,
  STUDIO_SHORTCUT_SECTION,
  MODERATION_SHORTCUT_SECTION,
];

/** Static sections to list for a route (global + navigation + matching contextual ones). */
export function shortcutSectionsFor(variant: ShellVariant, pathname: string): ShortcutSectionDoc[] {
  return [
    globalShortcutSection(variant),
    navigationShortcutSection(variant),
    ...CONTEXTUAL_SHORTCUT_SECTIONS.filter(
      (s) => !s.routes || s.routes.some((r) => pathname === r || pathname.startsWith(`${r}/`)),
    ).filter((s) => s.id !== "moderation" || variant === "admin"),
  ];
}
