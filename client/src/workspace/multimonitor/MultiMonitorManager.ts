import type { WorkspaceScreen } from "@shared/workspaceLayout";

export type MultiMonitorOpenStatus = "opened" | "focused" | "blocked";

export type MultiMonitorOpenResult = {
  screenId: string;
  status: MultiMonitorOpenStatus;
};

type ManagedWindow = {
  closed: boolean;
  focus(): void;
  close(): void;
};

type MultiMonitorManagerOptions = {
  open: (url: string, target?: string, features?: string) => ManagedWindow | null;
  origin: string;
  workspaceName?: string;
};

export class MultiMonitorManager {
  private readonly windows = new Map<string, ManagedWindow>();
  private readonly openWindow: MultiMonitorManagerOptions["open"];
  private readonly origin: string;
  private readonly workspaceName: string;

  constructor(options: MultiMonitorManagerOptions) {
    this.openWindow = options.open;
    this.origin = options.origin.replace(/\/$/, "");
    this.workspaceName = options.workspaceName ?? "default";
  }

  openScreen(screen: WorkspaceScreen): MultiMonitorOpenStatus {
    if (screen.mode === "primary") {
      throw new Error("WORKSPACE_PRIMARY_SCREEN_CANNOT_OPEN_EXTERNALLY");
    }

    const current = this.windows.get(screen.screenId);
    if (current && !current.closed) {
      current.focus();
      return "focused";
    }
    if (current?.closed) this.windows.delete(screen.screenId);

    const url = this.buildExternalUrl(screen.screenId);
    const opened = this.openWindow(url, `workspace-screen-${screen.screenId}`);
    if (!opened) return "blocked";

    this.windows.set(screen.screenId, opened);
    return "opened";
  }

  openAllExternal(screens: readonly WorkspaceScreen[]): MultiMonitorOpenResult[] {
    return screens
      .filter(screen => screen.mode === "external")
      .sort((a, b) => a.order - b.order)
      .map(screen => ({ screenId: screen.screenId, status: this.openScreen(screen) }));
  }

  focusScreen(screenId: string): boolean {
    const current = this.windows.get(screenId);
    if (!current || current.closed) {
      if (current?.closed) this.windows.delete(screenId);
      return false;
    }
    current.focus();
    return true;
  }

  closeScreen(screenId: string): boolean {
    const current = this.windows.get(screenId);
    if (!current) return false;
    if (!current.closed) current.close();
    this.windows.delete(screenId);
    return true;
  }

  isOpen(screenId: string): boolean {
    const current = this.windows.get(screenId);
    if (!current) return false;
    if (current.closed) {
      this.windows.delete(screenId);
      return false;
    }
    return true;
  }

  syncClosedWindows(): void {
    for (const [screenId, managedWindow] of this.windows) {
      if (managedWindow.closed) this.windows.delete(screenId);
    }
  }

  private buildExternalUrl(screenId: string): string {
    const params = new URLSearchParams({
      workspace: this.workspaceName,
      screen: screenId,
    });
    return `${this.origin}/workspace/external?${params.toString()}`;
  }
}
