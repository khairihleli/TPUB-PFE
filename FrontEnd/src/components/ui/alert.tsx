import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type AlertTone = "info" | "warning" | "danger" | "success";

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons/links under the text. */
  action?: ReactNode;
  /** Replace the default icon (pass null to hide). */
  icon?: ReactNode | null;
  /**
   * Live region behaviour. Default: danger → "alert" (assertive), others → "status" (polite).
   * Use "none" for static notices rendered with the page.
   */
  live?: "alert" | "status" | "none";
  className?: string;
}

const TONE: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-info/30 bg-info/8", icon: "text-info", Icon: Info },
  warning: { box: "border-warning/30 bg-warning/8", icon: "text-warning", Icon: TriangleAlert },
  danger: { box: "border-danger/35 bg-danger/8", icon: "text-danger", Icon: CircleAlert },
  success: { box: "border-success/30 bg-success/8", icon: "text-success", Icon: CircleCheck },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  icon,
  live,
  className,
}: AlertProps) {
  const t = TONE[tone];
  const liveMode = live ?? (tone === "danger" ? "alert" : "status");
  const role = liveMode === "none" ? undefined : liveMode;
  const DefaultIcon = t.Icon;
  return (
    <div
      role={role}
      className={cx("flex gap-3 rounded-card border px-4 py-3.5 sm:px-5 sm:py-4", t.box, className)}
    >
      {icon === null ? null : (
        <span aria-hidden="true" className={cx("mt-0.5 shrink-0 [&_svg]:size-5", t.icon)}>
          {icon ?? <DefaultIcon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="font-label text-[0.9375rem] font-semibold text-ink-strong">{title}</p>
        ) : null}
        {children ? (
          <div className={cx("text-sm leading-relaxed text-ink-soft", title ? "mt-1" : undefined)}>
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
