import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOAST_OFFSET_VAR, useStickyBarOffset } from "@/components/ui/use-sticky-bar-offset";

function Bar({ height, active = true }: { height: number; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useStickyBarOffset(ref, active, 0);
  return <div ref={ref} data-height={height} />;
}

const offset = () => document.documentElement.style.getPropertyValue(TOAST_OFFSET_VAR);

describe("useStickyBarOffset", () => {
  afterEach(() => vi.restoreAllMocks());

  it("publishes the tallest mounted bar and falls back when one unmounts", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return { height: Number(this.dataset.height ?? 0) } as DOMRect;
    });
    const bottom = render(<Bar height={64} />);
    expect(offset()).toBe("64px");
    const studio = render(<Bar height={120} />);
    expect(offset()).toBe("120px");
    studio.unmount();
    expect(offset()).toBe("64px");
    bottom.rerender(<Bar height={64} active={false} />);
    expect(offset()).toBe("0px");
  });
});
