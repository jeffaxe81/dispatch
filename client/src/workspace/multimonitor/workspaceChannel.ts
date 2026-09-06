export type WorkspaceChannelEvent =
  | { type: "workspace-screen-opened"; screenId: string }
  | { type: "workspace-screen-closed"; screenId: string }
  | { type: "workspace-layout-updated" }
  | { type: "workspace-refresh-requested" }
  | { type: "workspace-focus-screen"; screenId: string };

export type WorkspaceChannel = {
  publish(event: WorkspaceChannelEvent): void;
  subscribe(listener: (event: WorkspaceChannelEvent) => void): () => void;
  close(): void;
};

const screenEventTypes = new Set([
  "workspace-screen-opened",
  "workspace-screen-closed",
  "workspace-focus-screen",
]);

const simpleEventTypes = new Set([
  "workspace-layout-updated",
  "workspace-refresh-requested",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorkspaceChannelEvent(value: unknown): value is WorkspaceChannelEvent {
  if (!isPlainObject(value) || typeof value.type !== "string") return false;

  if (screenEventTypes.has(value.type)) {
    return Object.keys(value).length === 2 &&
      typeof value.screenId === "string" &&
      value.screenId.trim().length > 0 &&
      value.screenId.length <= 120;
  }

  if (simpleEventTypes.has(value.type)) {
    return Object.keys(value).length === 1;
  }

  return false;
}

export function createWorkspaceChannel(name: string): WorkspaceChannel {
  const channelName = name.trim();
  if (!channelName) throw new Error("WORKSPACE_CHANNEL_NAME_INVALID");

  let closed = false;
  const listeners = new Set<(event: WorkspaceChannelEvent) => void>();
  const BroadcastChannelConstructor = globalThis.BroadcastChannel;
  const transport = typeof BroadcastChannelConstructor === "function"
    ? new BroadcastChannelConstructor(channelName)
    : null;

  const handleMessage = (message: MessageEvent<unknown>) => {
    if (closed || !isWorkspaceChannelEvent(message.data)) return;
    for (const listener of listeners) listener(message.data);
  };

  transport?.addEventListener("message", handleMessage);

  return {
    publish(event) {
      if (closed) throw new Error("WORKSPACE_CHANNEL_CLOSED");
      if (!isWorkspaceChannelEvent(event)) throw new Error("WORKSPACE_CHANNEL_EVENT_INVALID");
      transport?.postMessage(event);
    },

    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      transport?.removeEventListener("message", handleMessage);
      transport?.close();
    },
  };
}
