/**
 * Screen colours of a priority message by urgency level (contract §5 F3 player):
 * CRITICAL / HIGH red, MEDIUM orange (dark ink: white on orange fails contrast), LOW blue.
 * Shared by the player takeover and the back-office preview.
 */
import type { UrgencyLevel } from "@/lib/api/types";

export interface UrgencyTheme {
  /** Stage background. */
  ground: string;
  /** Radial highlight colour (CSS colour value). */
  glow: string;
  /** Text colour on the stage. */
  ink: string;
  /** Frame / separators colour. */
  frame: string;
  /** Icon disc: background + icon colour. */
  disc: string;
  /** Kicker shown above the title. */
  kicker: string;
}

const RED: Omit<UrgencyTheme, "kicker"> = {
  ground: "bg-brand-red-600",
  glow: "var(--color-brand-red)",
  ink: "text-on-brand",
  frame: "border-on-brand",
  disc: "bg-on-brand text-brand-red-600",
};

export const URGENCY_THEME: Record<UrgencyLevel, UrgencyTheme> = {
  CRITICAL: { ...RED, kicker: "Alerte critique" },
  HIGH: { ...RED, kicker: "Message prioritaire" },
  MEDIUM: {
    ground: "bg-brand-orange",
    glow: "color-mix(in srgb, var(--color-white) 28%, transparent)",
    ink: "text-black",
    frame: "border-black",
    disc: "bg-black text-brand-orange",
    kicker: "Message important",
  },
  LOW: {
    ground: "bg-brand-blue-600",
    glow: "var(--color-brand-blue)",
    ink: "text-white",
    frame: "border-white",
    disc: "bg-white text-brand-blue-600",
    kicker: "Information",
  },
};

export function urgencyTheme(level: UrgencyLevel | null | undefined): UrgencyTheme {
  return URGENCY_THEME[level ?? "HIGH"] ?? URGENCY_THEME.HIGH;
}
