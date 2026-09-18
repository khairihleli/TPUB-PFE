import {
  AppWindow,
  Globe,
  type LucideIcon,
  Monitor,
  RectangleHorizontal,
  Search,
  SearchX,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { StatusPill } from "@/components/ui/status-pill";
import { ESTIMATE_COST_RULE } from "@/content/glossary";
import type { CampaignResponse, SupportType } from "@/lib/api/types";
import type { Tone } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";

/** Rule shown next to estimated costs (glossary, api-contract §7.17). */
export const ESTIMATE_TOOLTIP = ESTIMATE_COST_RULE;

/** Neutral « Estimation » tag + rule (VD-16): the shared ui component. */
export { EstimateTag, type EstimateTagProps } from "@/components/ui/estimate-tag";

/** Solid accent (bars, dots) per status tone. */
export const TONE_ACCENT: Record<Tone, string> = {
  info: "bg-info",
  warning: "bg-warning",
  blue: "bg-brand-blue-text",
  success: "bg-success",
  muted: "bg-muted-2",
  danger: "bg-danger",
  violet: "bg-violet-text",
  neutral: "bg-ink-soft",
};

export const SUPPORT_TYPE_ICON: Record<SupportType, LucideIcon> = {
  ECRAN: Monitor,
  PANNEAU_NUMERIQUE: RectangleHorizontal,
  POINT_WIFI: Wifi,
  APPLICATION: AppWindow,
  SITE_WEB: Globe,
};

export interface FactItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Span the full row. */
  wide?: boolean;
}

/** Definition list laid out as a hairline grid (sentence-case 13px labels, UX-PLAN §4.9). */
export function FactGrid({
  items,
  columns = 2,
  className,
}: {
  items: readonly FactItem[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cx(
        "grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-card border border-line bg-line",
        columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cx(
            "flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5",
            item.wide && "sm:col-span-full",
          )}
        >
          <dt className="font-label text-[0.8125rem] font-medium text-muted">{item.label}</dt>
          <dd className="min-w-0 text-[0.9375rem] leading-relaxed break-words text-ink">
            {item.value}
          </dd>
          {item.hint ? <dd className="text-[0.8125rem] text-muted">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export const CAMPAIGN_NOT_FOUND_MESSAGE =
  "Cette campagne n'existe pas ou n'appartient pas à votre espace.";

export interface CampaignNotFoundProps {
  /** Up to 3 recent campaigns from /mine, offered as links. */
  recent?: readonly Pick<CampaignResponse, "id" | "name" | "status" | "startDate" | "endDate">[];
  /** Opens the command palette (« Rechercher (⌘K) »). */
  onSearch?: () => void;
  /** Card heading « Campagne introuvable ». Hide it when the page h1 already says it. */
  showTitle?: boolean;
}

/** Shown when an id is not one of the advertiser's campaigns (or does not exist) — IA-23. */
export function CampaignNotFound({ recent, onSearch, showTitle = true }: CampaignNotFoundProps) {
  const list = recent?.slice(0, 3) ?? [];
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line-strong bg-overlay-subtle px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mb-1 inline-flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-muted"
      >
        <SearchX className="size-5.5" />
      </span>
      {showTitle ? (
        <p className="font-display text-lg font-semibold text-ink-strong">Campagne introuvable</p>
      ) : null}
      <p className="max-w-md text-sm leading-relaxed text-muted">{CAMPAIGN_NOT_FOUND_MESSAGE}</p>

      {list.length > 0 ? (
        <div className="mt-3 w-full max-w-md text-left">
          <p className="mb-2 text-[0.8125rem] font-medium text-muted">Vos campagnes récentes</p>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {list.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-surface px-4 py-3"
              >
                <Link
                  href={routes.espace.campaign(c.id)}
                  className="min-w-0 font-label text-[0.9375rem] font-semibold break-words text-ink-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
                >
                  {c.name}
                </Link>
                <StatusPill type="campaign" campaign={c} audience="annonceur" size="sm" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-center gap-2.5">
        <Button asChild variant={onSearch ? "secondary" : "primary"}>
          <Link href={routes.espace.campaigns()}>Voir mes campagnes</Link>
        </Button>
        {onSearch ? (
          <Button variant="ghost" onClick={onSearch} iconLeft={<Search aria-hidden="true" />}>
            Rechercher
            <Kbd keys="mod+k" className="ml-1" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
