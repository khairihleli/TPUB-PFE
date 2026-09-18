import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "@/lib/forms/autosave";
import {
  draftStorageKey,
  hasDirtyDrafts,
  readDraft,
  useFormDraft,
  writeDraft,
} from "@/lib/forms/form-draft";
import {
  hasUnsavedChanges,
  resetUnsavedGuards,
  shouldInterceptLinkClick,
  useUnsavedChangesGuard,
} from "@/lib/forms/unsaved-guard";

beforeEach(() => {
  resetUnsavedGuards();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnsavedChangesGuard", () => {
  it("attaches beforeunload only while dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard({ dirty }), {
      initialProps: { dirty: false },
    });
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(false);
    expect(hasUnsavedChanges()).toBe(false);

    rerender({ dirty: true });
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    expect(hasUnsavedChanges()).toBe(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    rerender({ dirty: false });
    expect(remove.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
    unmount();
  });

  it("decides which link clicks to intercept", () => {
    const click = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
    };
    const loc = {
      origin: "http://localhost",
      pathname: "/espace/campagnes/nouvelle",
      search: "?id=7",
    };
    const a = (
      href: string,
      extra: Partial<{ target: string; hasDownload: boolean; optOut: boolean }> = {},
    ) => ({
      href,
      target: "",
      hasDownload: false,
      optOut: false,
      ...extra,
    });
    expect(shouldInterceptLinkClick(click, a("/espace/campagnes"), loc)).toBe("/espace/campagnes");
    expect(
      shouldInterceptLinkClick(click, a("/espace/campagnes/nouvelle?id=7#aide"), loc),
    ).toBeNull();
    expect(shouldInterceptLinkClick(click, a("https://tukhnanutha.com"), loc)).toBeNull();
    expect(shouldInterceptLinkClick(click, a("/faq", { target: "_blank" }), loc)).toBeNull();
    expect(shouldInterceptLinkClick({ ...click, metaKey: true }, a("/espace"), loc)).toBeNull();
    expect(shouldInterceptLinkClick(click, a("/connexion", { optOut: true }), loc)).toBeNull();
  });
});

describe("useFormDraft", () => {
  it("stores per user/key/version, restores on mount and expires after 24 h", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const key = draftStorageKey("campaign:new", 5, 1);
    expect(key).toBe("zelqane:draft:v1:5:campaign:new");

    const { rerender, unmount } = renderHook(
      ({ value, dirty }) => useFormDraft({ key: "campaign:new", value, dirty, userId: 5 }),
      { initialProps: { value: { name: "" }, dirty: false } },
    );
    rerender({ value: { name: "Ouverture La Marsa" }, dirty: true });
    expect(hasDirtyDrafts()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(readDraft<{ name: string }>(key)?.value).toEqual({ name: "Ouverture La Marsa" });
    unmount();
    expect(hasDirtyDrafts()).toBe(false);

    const onRestore = vi.fn();
    const restored = renderHook(() =>
      useFormDraft({
        key: "campaign:new",
        value: { name: "" },
        dirty: false,
        userId: 5,
        onRestore,
      }),
    );
    expect(onRestore).toHaveBeenCalledWith({ name: "Ouverture La Marsa" }, expect.any(Date));
    expect(restored.result.current.restoredValue).toEqual({ name: "Ouverture La Marsa" });
    act(() => restored.result.current.clear());
    expect(readDraft(key)).toBeNull();
    expect(restored.result.current.restoredAt).toBeNull();

    writeDraft(key, { name: "vieux" }, Date.now() - 25 * 60 * 60 * 1000);
    expect(readDraft(key)).toBeNull();
  });

  it("survives unavailable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readDraft("k")).toBeNull();
    expect(writeDraft("k", 1)).toBe(false);
    const { result } = renderHook(() => useFormDraft({ key: "x", value: 1, dirty: true }));
    expect(result.current.restoredAt).toBeNull();
  });
});

describe("useAutosave", () => {
  function Form({
    save,
    enabled = true,
  }: {
    save: (v: string) => Promise<unknown>;
    enabled?: boolean;
  }) {
    const [value, setValue] = useStateValue("Brouillon");
    const auto = useAutosave({ value, save, enabled, delay: 1500 });
    return (
      <>
        <input aria-label="Nom" value={value} onChange={(e) => setValue(e.target.value)} />
        <output data-testid="state">{auto.state}</output>
        <button type="button" onClick={auto.retry}>
          Réessayer
        </button>
      </>
    );
  }

  it("debounces, saves the latest value and reports errors with retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn<(v: string) => Promise<unknown>>().mockResolvedValue(undefined);
    render(<Form save={save} />);
    expect(screen.getByTestId("state")).toHaveTextContent("idle");

    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Brouillon A" } });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Brouillon AB" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("Brouillon AB");
    expect(screen.getByTestId("state")).toHaveTextContent("saved");

    save.mockRejectedValueOnce(new Error("réseau"));
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Brouillon ABC" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(screen.getByTestId("state")).toHaveTextContent("error");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(save).toHaveBeenCalledTimes(2); // no retry loop

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(save).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("state")).toHaveTextContent("saved");
  });

  it("does nothing while disabled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn().mockResolvedValue(undefined);
    render(<Form save={save} enabled={false} />);
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "x" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(save).not.toHaveBeenCalled();
  });
});

function useStateValue(initial: string) {
  return useState(initial);
}
