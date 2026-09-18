"use client";

import { Plus } from "lucide-react";
import { Accordion } from "radix-ui";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export interface FaqProps {
  items: readonly FaqItem[];
  /** Index of the item open by default. */
  defaultOpen?: number;
  /** Heading level used for each question button wrapper (default h3). */
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}

/** Accessible accordion (Radix): buttons with aria-expanded, arrow-key navigation. */
export function Faq({ items, defaultOpen, headingLevel = "h3", className }: FaqProps) {
  const Heading = headingLevel;
  return (
    <Accordion.Root
      type="single"
      collapsible
      defaultValue={defaultOpen !== undefined ? `faq-${defaultOpen}` : undefined}
      className={cx("flex flex-col border-t border-line", className)}
    >
      {items.map((item, i) => (
        <Accordion.Item
          key={item.question}
          value={`faq-${i}`}
          className="group/faq border-b border-line"
        >
          <Accordion.Header asChild>
            <Heading className="m-0">
              <Accordion.Trigger className="flex min-h-touch w-full items-center justify-between gap-6 py-5 text-left font-display text-[1.0625rem] leading-snug font-semibold text-ink-strong transition-colors hover:text-brand-orange-text sm:text-lg">
                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition-[transform,background-color,border-color,color] duration-300 ease-expo group-data-[state=open]/faq:rotate-45 group-data-[state=open]/faq:border-orange-line group-data-[state=open]/faq:bg-orange-soft group-data-[state=open]/faq:text-brand-orange-text"
                >
                  <Plus className="size-4" />
                </span>
              </Accordion.Trigger>
            </Heading>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden">
            <div className="max-w-[70ch] pr-12 pb-6 text-[0.9375rem] leading-relaxed text-muted">
              {item.answer}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
