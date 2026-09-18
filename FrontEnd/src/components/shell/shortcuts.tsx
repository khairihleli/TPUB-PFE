"use client";

/**
 * Keyboard shortcuts (UX-PLAN §5.2): one document listener, a registry for page shortcuts
 * (`useShortcut`) and the « ? » sheet (`ShortcutsDialog`).
 */
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  isEditableTarget,
  isSingleKey,
  matchesStroke,
  parseKeys,
  SEQUENCE_TIMEOUT_MS,
  setSingleKeyShortcutsEnabled,
  type ShellVariant,
  shortcutSectionsFor,
  type ShortcutSectionDoc,
  singleKeyShortcutsEnabled,
} from "@/lib/shortcuts";

export interface ShortcutOptions {
  /** Handler only runs when this returns true. */
  when?: () => boolean;
  /** Label in the « ? » sheet. */
  description: string;
  /** Section title in the sheet (e.g. « Examen de modération »). */
  section: string;
  /** Allow while focus is in an input (modifier shortcuts only; default false). */
  allowInEditable?: boolean;
  /** Allow while a dialog has focus (the dialog's own keys, e.g. J/K/V/R in the review). */
  allowInDialog?: boolean;
  enabled?: boolean;
}

interface Registered {
  id: string;
  keys: string;
  handler: (e: KeyboardEvent) => void;
  opts: ShortcutOptions;
}

interface ShortcutsContextValue {
  register: (entry: Registered) => void;
  unregister: (id: string) => void;
  openHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

/** True when an open dialog (other than the command palette) currently contains focus. */
export function focusInForeignDialog(target: EventTarget | null): boolean {
  const el = target as Element | null;
  const dialog = el?.closest?.('[role="dialog"], [role="alertdialog"]');
  return Boolean(dialog && !dialog.hasAttribute("data-command-palette"));
}

interface Sequence {
  key: string;
  at: number;
}

/** Pure dispatcher shared by the provider and the standalone `useShortcut` fallback. */
export function shortcutMatches(
  entry: Pick<Registered, "keys" | "opts">,
  e: KeyboardEvent,
  pendingFirst: Sequence | null,
  singleKeysEnabled: boolean,
): "match" | "first" | null {
  if (entry.opts.enabled === false) return null;
  const strokes = parseKeys(entry.keys);
  const single = isSingleKey(entry.keys);
  if (single && !singleKeysEnabled) return null;
  if (!entry.opts.allowInEditable && isEditableTarget(e.target)) return null;
  if (!entry.opts.allowInDialog && focusInForeignDialog(e.target)) return null;
  if (single && (e.ctrlKey || e.metaKey || e.altKey)) return null;
  if (entry.opts.when && !entry.opts.when()) return null;
  if (strokes.length === 1) return strokes[0] && matchesStroke(e, strokes[0]) ? "match" : null;
  const [first, second] = strokes;
  if (!first || !second) return null;
  if (
    pendingFirst &&
    Date.now() - pendingFirst.at <= SEQUENCE_TIMEOUT_MS &&
    pendingFirst.key === first.key &&
    matchesStroke(e, second)
  ) {
    return "match";
  }
  return matchesStroke(e, first) ? "first" : null;
}

export function ShortcutsProvider({
  variant,
  children,
}: {
  variant: ShellVariant;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const registry = useRef<Registered[]>([]);
  const [docs, setDocs] = useState<Registered[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const pending = useRef<Sequence | null>(null);

  const register = useCallback((entry: Registered) => {
    registry.current = [...registry.current.filter((r) => r.id !== entry.id), entry];
    setDocs(registry.current);
  }, []);
  const unregister = useCallback((id: string) => {
    registry.current = registry.current.filter((r) => r.id !== id);
    setDocs(registry.current);
  }, []);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const enabled = singleKeyShortcutsEnabled();
      let sequenceStarted = false;
      // Most recently registered first (a page overrides the shell); a completed sequence
      // (« G » then « R ») wins over a single key (« R ») pressed as its second stroke.
      const ordered = [...registry.current].reverse();
      const results = ordered.map((entry) => ({
        entry,
        result: shortcutMatches(entry, e, pending.current, enabled),
      }));
      const hit =
        results.find((r) => r.result === "match" && parseKeys(r.entry.keys).length > 1) ??
        results.find((r) => r.result === "match");
      if (hit) {
        e.preventDefault();
        pending.current = null;
        hit.entry.handler(e);
        return;
      }
      sequenceStarted = results.some((r) => r.result === "first");
      if (sequenceStarted) pending.current = { key: e.key.toLowerCase(), at: Date.now() };
      else if (!["Shift", "Control", "Meta", "Alt"].includes(e.key)) pending.current = null;
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ register, unregister, openHelp }),
    [register, unregister, openHelp],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        sections={mergeSections(shortcutSectionsFor(variant, pathname), docs)}
      />
    </ShortcutsContext.Provider>
  );
}

/** Static sections + registered page shortcuts grouped by section (duplicates removed). */
export function mergeSections(
  base: readonly ShortcutSectionDoc[],
  registered: readonly Pick<Registered, "keys" | "opts">[],
): ShortcutSectionDoc[] {
  const out = base.map((s) => ({ ...s, items: [...s.items] }));
  for (const r of registered) {
    if (r.opts.enabled === false) continue;
    let section = out.find((s) => s.title === r.opts.section);
    if (!section) {
      section = { id: r.opts.section, title: r.opts.section, items: [] };
      out.push(section);
    }
    if (!section.items.some((i) => i.keys === r.keys)) {
      section.items.push({ keys: r.keys, label: r.opts.description });
    }
  }
  return out.filter((s) => s.items.length > 0);
}

/**
 * `useShortcut("v", validate, { description: "Valider", section: "Examen de modération", allowInDialog: true })`
 * Registers into the « ? » sheet. Outside ShortcutsProvider it binds its own listener with the
 * same rules (tests, isolated components).
 */
export function useShortcut(
  keys: string,
  handler: (e: KeyboardEvent) => void,
  opts: ShortcutOptions,
): void {
  const ctx = useContext(ShortcutsContext);
  const id = useId();
  const handlerRef = useRef(handler);
  const optsRef = useRef(opts);
  useEffect(() => {
    handlerRef.current = handler;
    optsRef.current = opts;
  });

  const { description, section, enabled, allowInDialog, allowInEditable } = opts;

  useEffect(() => {
    const entry: Registered = {
      id,
      keys,
      handler: (e) => handlerRef.current(e),
      opts: {
        description,
        section,
        enabled,
        allowInDialog,
        allowInEditable,
        when: () => optsRef.current.when?.() ?? true,
      },
    };
    if (ctx) {
      ctx.register(entry);
      return () => ctx.unregister(id);
    }
    let pendingFirst: Sequence | null = null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const result = shortcutMatches(entry, e, pendingFirst, singleKeyShortcutsEnabled());
      if (result === "match") {
        e.preventDefault();
        pendingFirst = null;
        entry.handler(e);
      } else if (result === "first") pendingFirst = { key: e.key.toLowerCase(), at: Date.now() };
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ctx, id, keys, description, section, enabled, allowInDialog, allowInEditable]);
}

/** `const { openHelp } = useShortcutsHelp()` — opens the « ? » sheet (help & account menus). */
export function useShortcutsHelp(): { openHelp: () => void } {
  const ctx = useContext(ShortcutsContext);
  return { openHelp: ctx?.openHelp ?? (() => undefined) };
}

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly ShortcutSectionDoc[];
}

/** « Raccourcis clavier » sheet with the WCAG 2.1.4 single-key switch. */
export function ShortcutsDialog({ open, onOpenChange, sections }: ShortcutsDialogProps) {
  const [singleKeys, setSingleKeys] = useState(true);
  const switchId = useId();
  useEffect(() => {
    if (open) setSingleKeys(singleKeyShortcutsEnabled());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Raccourcis clavier"
        description="Les raccourcis à une touche ne s'activent pas pendant la saisie dans un champ."
        size="lg"
      >
        <div className="flex flex-col gap-6 pb-4">
          <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface-2 px-4 py-3">
            <label htmlFor={switchId} className="text-sm text-ink-soft">
              Désactiver les raccourcis à une touche
            </label>
            <button
              id={switchId}
              type="button"
              role="switch"
              aria-checked={!singleKeys}
              onClick={() => {
                const next = !singleKeys;
                setSingleKeys(next);
                setSingleKeyShortcutsEnabled(next);
              }}
              className="group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line-strong bg-surface-3 transition-colors aria-checked:border-brand-blue aria-checked:bg-brand-blue"
            >
              <span
                aria-hidden="true"
                className="absolute left-1 size-5 rounded-full bg-ink transition-transform duration-200 group-aria-checked:translate-x-5"
              />
            </button>
          </div>
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`${switchId}-${section.id}`}>
              <h3
                id={`${switchId}-${section.id}`}
                className="mb-2 font-label text-sm font-semibold text-ink-strong"
              >
                {section.title}
              </h3>
              <dl className="divide-y divide-line rounded-card border border-line">
                {section.items.map((item) => (
                  <div
                    key={`${section.id}-${item.keys}`}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <dt className="text-sm text-ink-soft">{item.label}</dt>
                    <dd className="shrink-0">
                      <Kbd keys={item.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
