"use client";

import {
  Axis3d,
  CarFront,
  Drone,
  Focus,
  Moon,
  Orbit,
  PersonStanding,
  RotateCcw,
  Sun,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import {
  CAMERA_PRESETS,
  effectiveFace,
  faceOptionsFor,
  type CameraPreset,
} from "@/components/porteur3d/scene-config";
import type {
  CameraPresetId,
  StudioFace,
  StudioPorteurType,
  TimeOfDay,
} from "@/components/porteur3d/types";
import { cx } from "@/lib/cx";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const PRESET_ICONS: Record<CameraPreset["icon"], IconType> = {
  orbit: Orbit,
  pedestrian: PersonStanding,
  car: CarFront,
  drone: Drone,
  face: Focus,
};

export interface StudioControlsProps {
  type: StudioPorteurType;
  view: CameraPresetId;
  onViewChange: (view: CameraPresetId) => void;
  timeOfDay: TimeOfDay;
  onTimeOfDayChange: (value: TimeOfDay) => void;
  face?: StudioFace;
  onFaceChange?: (face: StudioFace) => void;
  /** Staff calibration toggle; hidden when no handler is given. */
  repere?: boolean;
  onRepereChange?: (value: boolean) => void;
  /** « Réinitialiser la vue » (e.g. increment the studio `viewRequest`). */
  onResetView?: () => void;
  /** "bar" wraps groups on one row; "stack" puts each group on its own line (narrow sidebars). */
  layout?: "bar" | "stack";
  className?: string;
}

const segment =
  "inline-flex min-h-touch items-center justify-center gap-1.5 rounded-full px-3 font-label text-[0.75rem] font-semibold whitespace-nowrap transition-colors duration-200 ease-smooth focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10";

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="px-1 font-label text-[0.75rem] font-bold text-muted-2" aria-hidden="true">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-[22px] border border-line bg-surface/70 p-1"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Controls bar for the Studio 3D, placed by pages next to `PorteurStudio`: viewpoints (1–5),
 * jour/nuit, face (per type), repère toggle and reset. Pure presentational + callbacks.
 */
export function StudioControls({
  type,
  view,
  onViewChange,
  timeOfDay,
  onTimeOfDayChange,
  face = "all",
  onFaceChange,
  repere,
  onRepereChange,
  onResetView,
  layout = "bar",
  className,
}: StudioControlsProps) {
  const faces = faceOptionsFor(type);
  const current = effectiveFace(type, face);
  const pressed = (active: boolean) =>
    active
      ? "bg-surface-3 text-ink-strong shadow-lift"
      : "text-muted hover:bg-surface-2 hover:text-ink";

  return (
    <div
      className={cx(
        "flex gap-3",
        layout === "stack" ? "flex-col" : "flex-row flex-wrap items-end",
        className,
      )}
    >
      <Group label="Point de vue">
        {CAMERA_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.icon];
          const active = preset.id === view;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              aria-keyshortcuts={preset.key}
              title={`${preset.description} (touche ${preset.key})`}
              onClick={() => onViewChange(preset.id)}
              className={cx(segment, pressed(active))}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{preset.label}</span>
              <kbd
                aria-hidden="true"
                className="hidden rounded-[5px] border border-line px-1 font-sans text-[0.75rem] leading-4 text-muted-2 lg:inline"
              >
                {preset.key}
              </kbd>
            </button>
          );
        })}
      </Group>

      <Group label="Ambiance">
        {(["jour", "nuit"] as const).map((value) => {
          const Icon = value === "jour" ? Sun : Moon;
          const active = timeOfDay === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onTimeOfDayChange(value)}
              className={cx(segment, pressed(active))}
            >
              <Icon
                aria-hidden="true"
                className={cx(
                  "size-4",
                  active && (value === "jour" ? "text-warning" : "text-brand-blue-text"),
                )}
              />
              {value === "jour" ? "Jour" : "Nuit"}
            </button>
          );
        })}
      </Group>

      <Group label="Face">
        {faces.length <= 1 || !onFaceChange ? (
          <span className={cx(segment, "cursor-default bg-surface-3 text-ink-strong")}>
            {faces.find((f) => f.value === current)?.label ?? faces[0]?.label ?? "Sans écran"}
          </span>
        ) : (
          faces.map((option) => {
            const active = option.value === current;
            return (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={active}
                onClick={() => onFaceChange(option.value)}
                className={cx(segment, pressed(active))}
              >
                {option.label}
              </button>
            );
          })
        )}
      </Group>

      {onRepereChange || onResetView ? (
        <Group label="Outils">
          {onResetView ? (
            <button
              type="button"
              onClick={onResetView}
              className={cx(segment, pressed(false))}
              aria-keyshortcuts="R"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Réinitialiser la vue
            </button>
          ) : null}
          {onRepereChange ? (
            <button
              type="button"
              aria-pressed={Boolean(repere)}
              onClick={() => onRepereChange(!repere)}
              className={cx(segment, pressed(Boolean(repere)))}
            >
              <Axis3d aria-hidden="true" className="size-4" />
              Repère
            </button>
          ) : null}
        </Group>
      ) : null}
    </div>
  );
}
