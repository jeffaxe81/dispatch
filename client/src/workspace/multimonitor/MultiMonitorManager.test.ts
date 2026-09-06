import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { MultiMonitorManager } from "./MultiMonitorManager";

function screen(screenId = "screen-2"): WorkspaceScreen {
  return {
    screenId,
    name: `Monitor ${screenId}`,
    order: 1,
    mode: "external",
    widgets: [],
  };
}

function fakeWindow() {
  return {
    closed: false,
    focus: vi.fn(),
    close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }),
  };
}

describe("MultiMonitorManager", () => {
  it("opens an external screen with a same-origin workspace route", () => {
    const opened = fakeWindow();
    const open = vi.fn(() => opened as never);
    const manager = new MultiMonitorManager({ open, origin: "https://dispatch.local" });

    expect(manager.openScreen(screen("map-screen"))).toBe("opened");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe("https://dispatch.local/workspace/external?workspace=default&screen=map-screen");
    expect(manager.isOpen("map-screen")).toBe(true);
  });

  it("focuses an already-open screen instead of duplicating it", () => {
    const opened = fakeWindow();
    const open = vi.fn(() => opened as never);
    const manager = new MultiMonitorManager({ open, origin: "https://dispatch.local" });

    expect(manager.openScreen(screen())).toBe("opened");
    expect(manager.openScreen(screen())).toBe("focused");
    expect(open).toHaveBeenCalledTimes(1);
    expect(opened.focus).toHaveBeenCalledTimes(1);
  });

  it("detects a closed window and allows it to be reopened", () => {
    const first = fakeWindow();
    const second = fakeWindow();
    const open = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const manager = new MultiMonitorManager({ open, origin: "https://dispatch.local" });

    manager.openScreen(screen());
    first.closed = true;
    manager.syncClosedWindows();

    expect(manager.isOpen("screen-2")).toBe(false);
    expect(manager.openScreen(screen())).toBe("opened");
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("reports blocked popups without registering a window", () => {
    const manager = new MultiMonitorManager({ open: vi.fn(() => null), origin: "https://dispatch.local" });

    expect(manager.openScreen(screen())).toBe("blocked");
    expect(manager.isOpen("screen-2")).toBe(false);
  });

  it("rejects the primary screen", () => {
    const open = vi.fn();
    const manager = new MultiMonitorManager({ open, origin: "https://dispatch.local" });

    expect(() => manager.openScreen({ ...screen("primary"), mode: "primary" })).toThrow("WORKSPACE_PRIMARY_SCREEN_CANNOT_OPEN_EXTERNALLY");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens all external screens and returns one result per surface", () => {
    const opened = fakeWindow();
    const open = vi.fn()
      .mockReturnValueOnce(opened as never)
      .mockReturnValueOnce(null);
    const manager = new MultiMonitorManager({ open, origin: "https://dispatch.local" });

    expect(manager.openAllExternal([
      { ...screen("primary"), mode: "primary" },
      screen("screen-a"),
      screen("screen-b"),
    ])).toEqual([
      { screenId: "screen-a", status: "opened" },
      { screenId: "screen-b", status: "blocked" },
    ]);
  });
});
