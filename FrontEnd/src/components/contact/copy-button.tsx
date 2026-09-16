"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";

export interface CopyButtonProps {
  value: string;
  /** Accessible name, e.g. « Copier l'adresse e-mail ». */
  label: string;
  className?: string;
}

/** Copies a value to the clipboard and announces the result politely. */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        className={cx(
          "inline-flex size-touch shrink-0 items-center justify-center rounded-control border border-line text-muted transition-colors duration-200 ease-smooth hover:border-line-strong hover:bg-white/6 hover:text-ink-strong [&_svg]:size-4",
          state === "copied" && "border-success/35 text-success hover:text-success",
          className,
        )}
      >
        {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Copié dans le presse-papiers."
          : state === "failed"
            ? "Copie impossible, sélectionnez le texte manuellement."
            : ""}
      </span>
    </>
  );
}
