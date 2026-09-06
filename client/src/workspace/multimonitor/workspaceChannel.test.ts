import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceChannel, type WorkspaceChannelEvent } from "./workspaceChannel";

type Listener = (event: MessageEvent<unknown>) => void;

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly name: string;
  readonly posted: unknown[] = [];
  closed = false;
  private listeners = new Set<Listener>();

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    if (this.closed) throw new Error("CHANNEL_CLOSED");
    this.posted.push(message);
  }

  addEventListener(type: string, listener: Listener) {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    if (type === "message") this.listeners.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(message: unknown) {
    for (const listener of this.listeners) {
      listener({ data: message } as MessageEvent<unknown>);
    }
  }
}

const originalBroadcastChannel = globalThis.BroadcastChannel;

afterEach(() => {
  Object.defineProperty(globalThis, "BroadcastChannel", {
    configurable: true,
    writable: true,
    value: originalBroadcastChannel,
  });
  FakeBroadcastChannel.instances = [];
  vi.restoreAllMocks();
});

describe("workspaceChannel", () => {
  it("publishes and subscribes only allowed workspace events", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: FakeBroadcastChannel,
    });

    const channel = createWorkspaceChannel("workspace:default");
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    const transport = FakeBroadcastChannel.instances[0]!;

    const event: WorkspaceChannelEvent = {
      type: "workspace-screen-opened",
      screenId: "map-wall",
    };
    channel.publish(event);
    expect(transport.posted).toEqual([event]);

    transport.emit({ type: "workspace-focus-screen", screenId: "map-wall" });
    expect(listener).toHaveBeenCalledWith({ type: "workspace-focus-screen", screenId: "map-wall" });

    transport.emit({ type: "execute-script", script: "alert(1)" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    transport.emit({ type: "workspace-refresh-requested" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects publishing events outside the allowlist", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: FakeBroadcastChannel,
    });

    const channel = createWorkspaceChannel("workspace:default");
    expect(() => channel.publish({ type: "execute-script" } as never)).toThrow("WORKSPACE_CHANNEL_EVENT_INVALID");
  });

  it("closes the underlying channel and becomes inert", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: FakeBroadcastChannel,
    });

    const channel = createWorkspaceChannel("workspace:default");
    const transport = FakeBroadcastChannel.instances[0]!;
    channel.close();

    expect(transport.closed).toBe(true);
    expect(() => channel.publish({ type: "workspace-refresh-requested" })).toThrow("WORKSPACE_CHANNEL_CLOSED");
  });

  it("uses a safe no-op fallback when BroadcastChannel is unavailable", () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const channel = createWorkspaceChannel("workspace:default");
    const listener = vi.fn();
    channel.subscribe(listener);

    expect(() => channel.publish({ type: "workspace-layout-updated" })).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
    expect(() => channel.close()).not.toThrow();
  });
});
