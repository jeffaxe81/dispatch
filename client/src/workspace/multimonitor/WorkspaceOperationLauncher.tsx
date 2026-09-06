import React, { useMemo } from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { MultiMonitorManager } from "./MultiMonitorManager";
import { OpenOperationLayoutButton } from "./OpenOperationLayoutButton";

type ManagedWindow = {
  closed: boolean;
  focus(): void;
  close(): void;
};

export type WorkspaceOperationLauncherProps = {
  screens: WorkspaceScreen[];
  openWindow?: (url: string, target?: string, features?: string) => ManagedWindow | null;
  origin?: string;
  workspaceName?: string;
};

export function WorkspaceOperationLauncher({
  screens,
  openWindow,
  origin,
  workspaceName = "default",
}: WorkspaceOperationLauncherProps) {
  const manager = useMemo(
    () => new MultiMonitorManager({
      open: openWindow ?? ((url, target, features) => window.open(url, target, features) as ManagedWindow | null),
      origin: origin ?? window.location.origin,
      workspaceName,
    }),
    [openWindow, origin, workspaceName],
  );

  return (
    <OpenOperationLayoutButton
      screens={screens}
      openAllExternal={candidateScreens => manager.openAllExternal(candidateScreens)}
    />
  );
}

export default WorkspaceOperationLauncher;
