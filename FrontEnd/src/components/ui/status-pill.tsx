"use client";

import { useOptionalSessionContext as useOptionalSession } from "@/components/shell/session-context";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type {
  AiReportStatusUpper,
  CampaignResponse,
  ReservationStatus,
  TechnicalStatus,
  UrgencyLevel,
} from "@/lib/api/types";
import {
  AI_REPORT_STATUS,
  type CampaignDisplayStatus,
  campaignStatusFor,
  getCampaignStatusMeta,
  RESERVATION_STATUS,
  type StatusAudience,
  TECHNICAL_STATUS,
  URGENCY_LEVEL,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";

type Common = { size?: "sm" | "md"; className?: string };

interface CampaignAudienceProps {
  /**
   * « annonceur » labels (En examen ZELQANE…) or « staff » precise labels (Avis IA favorable…).
   * Default: from the session role (ANNONCEUR → annonceur, staff → staff); « staff » outside a
   * session (public pages).
   */
  audience?: StatusAudience;
  /** Renders the secondary line (« Analyse favorable », « Diffusion à partir du … ») after the pill. */
  showHint?: boolean;
}

export type StatusPillProps = Common &
  (
    | ({
        /** Applies derived states (Programmée / Terminée) from dates. */
        type: "campaign";
        campaign: Pick<CampaignResponse, "status" | "startDate" | "endDate">;
        today?: string;
      } & CampaignAudienceProps)
    | ({ type: "campaign-status"; status: CampaignDisplayStatus } & CampaignAudienceProps)
    | {
        type: "reservation";
        status: ReservationStatus;
        /** « Bloqué · en attente de décision ZELQANE » instead of « Bloqué ». */
        long?: boolean;
      }
    | { type: "support"; status: TechnicalStatus }
    | { type: "urgency"; level: UrgencyLevel }
    | { type: "ai"; status: AiReportStatusUpper }
    | { type: "custom"; label: string; tone: BadgeTone; description?: string; pulse?: boolean }
  );

interface Resolved {
  label: string;
  tone: BadgeTone;
  description?: string;
  pulse?: boolean;
  hint?: string | null;
}

function resolve(props: StatusPillProps, sessionAudience: StatusAudience): Resolved {
  switch (props.type) {
    case "campaign":
      return getCampaignStatusMeta(props.campaign, {
        audience: props.audience ?? sessionAudience,
        today: props.today,
      });
    case "campaign-status":
      return campaignStatusFor(props.status, props.audience ?? sessionAudience);
    case "reservation": {
      const meta = RESERVATION_STATUS[props.status];
      return { ...meta, label: props.long ? meta.longLabel : meta.label };
    }
    case "support":
      return TECHNICAL_STATUS[props.status];
    case "urgency":
      return URGENCY_LEVEL[props.level];
    case "ai":
      return AI_REPORT_STATUS[props.status];
    case "custom":
      return props;
  }
}

/** Status label with tone + dot. Text always present: colour is never the only signal. */
export function StatusPill(props: StatusPillProps) {
  const session = useOptionalSession();
  const sessionAudience: StatusAudience = session?.role === "ANNONCEUR" ? "annonceur" : "staff";
  const meta = resolve(props, sessionAudience);
  const showHint =
    (props.type === "campaign" || props.type === "campaign-status") && props.showHint && meta.hint;

  const pill = (
    <Badge
      tone={meta.tone}
      dot
      pulse={meta.pulse}
      size={props.size}
      title={meta.description}
      className={showHint ? undefined : props.className}
    >
      {meta.label}
    </Badge>
  );

  if (!showHint) return pill;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2 gap-y-1", props.className)}>
      {pill}
      <span className="text-[0.8125rem] text-muted">{meta.hint}</span>
    </span>
  );
}
