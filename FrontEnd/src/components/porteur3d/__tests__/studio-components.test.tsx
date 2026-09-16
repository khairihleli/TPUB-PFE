import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PorteurStudioCanvas } from "@/components/porteur3d/porteur-studio-canvas";
import { StudioControls } from "@/components/porteur3d/studio-controls";

beforeAll(() => {
  // No WebGL in jsdom → the studio must render its static fallback, never crash.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterAll(() => {
  vi.restoreAllMocks();
});

function controls(overrides: Partial<Parameters<typeof StudioControls>[0]> = {}) {
  const props = {
    type: "B" as const,
    view: "orbite" as const,
    onViewChange: vi.fn(),
    timeOfDay: "jour" as const,
    onTimeOfDayChange: vi.fn(),
    face: "all" as const,
    onFaceChange: vi.fn(),
    ...overrides,
  };
  render(<StudioControls {...props} />);
  return props;
}

describe("StudioControls", () => {
  it("switches viewpoints and ambience", async () => {
    const user = userEvent.setup();
    const props = controls();
    expect(screen.getByRole("button", { name: /Orbite/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Piéton/ }));
    expect(props.onViewChange).toHaveBeenCalledWith("pieton");
    await user.click(screen.getByRole("button", { name: "Nuit" }));
    expect(props.onTimeOfDayChange).toHaveBeenCalledWith("nuit");
  });

  it("offers Les deux / Face 1 / Face 2 on a double-face Porteur", async () => {
    const user = userEvent.setup();
    const props = controls();
    const group = screen.getByRole("group", { name: "Face" });
    expect(group).toHaveTextContent("Les deux");
    await user.click(screen.getByRole("button", { name: "Face 2" }));
    expect(props.onFaceChange).toHaveBeenCalledWith(2);
  });

  it("shows a static face label for A and « Sans écran » for D, and hides staff tools by default", () => {
    const { unmount } = render(
      <StudioControls
        type="A"
        view="face"
        onViewChange={vi.fn()}
        timeOfDay="nuit"
        onTimeOfDayChange={vi.fn()}
        onFaceChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Face" })).toHaveTextContent("360°");
    expect(screen.queryByRole("button", { name: "360°" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Repère/ })).not.toBeInTheDocument();
    unmount();
    render(
      <StudioControls
        type="D"
        view="orbite"
        onViewChange={vi.fn()}
        timeOfDay="jour"
        onTimeOfDayChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Face" })).toHaveTextContent("Sans écran");
  });

  it("exposes repère and reset tools when handlers are given", async () => {
    const user = userEvent.setup();
    const onRepereChange = vi.fn();
    const onResetView = vi.fn();
    controls({ repere: false, onRepereChange, onResetView });
    await user.click(screen.getByRole("button", { name: /Repère/ }));
    expect(onRepereChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: /Réinitialiser la vue/ }));
    expect(onResetView).toHaveBeenCalled();
  });
});

describe("PorteurStudioCanvas without WebGL", () => {
  it("renders the static fallback with the reference render and a notice", () => {
    render(
      <PorteurStudioCanvas
        support={{
          name: "Corniche La Marsa",
          mastHeightM: 15,
          headingDeg: 45,
          technicalStatus: "ACTIF",
        }}
        type="C"
        timeOfDay="jour"
        view="orbite"
      />,
    );
    expect(screen.getByText(/Aperçu 3D indisponible/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Porteur Type C/ })).toBeInTheDocument();
    expect(screen.getByText("VOTRE MESSAGE ICI")).toBeInTheDocument();
    expect(screen.getByText("Corniche La Marsa")).toBeInTheDocument();
  });
});
