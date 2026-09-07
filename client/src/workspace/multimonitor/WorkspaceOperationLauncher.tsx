import React, { useMemo } from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { MultiMonitorManager } from "./MultiMonitorManager";
import { OpenOperationLayoutButton } from "./OpenOperationLayoutButton";

type ManagedWindow = {
  closed: boolean;
  focus(): void;
  close(): void;
  moveTo?(left: number, top: number): void;
  resizeTo?(width: number, height: number): void;
};

type ScreenDetailsLike = {
  screens?: readonly {
    label?: unknown;
    left?: unknown;
    top?: unknown;
    width?: unknown;
    height?: unknown;
    [key: string]: unknown;
  }[];
};

type GetScreenDetails = () => Promise<ScreenDetailsLike>;

export type WorkspaceOperationLauncherProps = {
  screens: WorkspaceScreen[];
  openWindow?: (url: string, target?: string, features?: string) => ManagedWindow | null;
  origin?: string;
  workspaceName?: string;
  getScreenDetails?: GetScreenDetails;
};

function resolveScreenDetailsProvider(explicit?: GetScreenDetails) {
  if (explicit) return explicit;

  const candidate = (window as Window & { getScreenDetails?: GetScreenDetails }).getScreenDetails;
  return typeof candidate === "function" ? candidate.bind(window) : undefined;
}

function createDisplayProvider(getScreenDetails?: GetScreenDetails) {
  if (!getScreenDetails) return undefined;

  return async () => {
    const details = await getScreenDetails();
    const rawScreens = Array.isArray(details?.screens) ? details.screens : [];

    return rawScreens.flatMap(raw => {
      const { label, left, top, width, height } = raw;
      if (
        typeof left !== "number" || !Number.isFinite(left) ||
        typeof top !== "number" || !Number.isFinite(top) ||
        typeof width !== "number" || !Number.isFinite(width) || width <= 0 ||
        typeof height !== "number" || !Number.isFinite(height) || height <= 0
      ) {
        return [];
      }

      return [{
        ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
        left,
        top,
        width,
        height,
      }];
    });
  };
}

export function WorkspaceOperationLauncher({
  screens,
  openWindow,
  origin,
  workspaceName = "default",
  getScreenDetails,
}: WorkspaceOperationLauncherProps) {
  const manager = useMemo(() => {
    const screenDetailsProvider = resolveScreenDetailsProvider(getScreenDetails);

    return new MultiMonitorManager({
      open: openWindow ?? ((url, target, features) => window.open(url, target, features) as ManagedWindow | null),
      origin: origin ?? window.location.origin,
      workspaceName,
      getDisplays: createDisplayProvider(screenDetailsProvider),
    });
  }, [getScreenDetails, openWindow, origin, workspaceName]);

  return (
    <OpenOperationLayoutButton
      screens={screens}
      openAllExternal={candidateScreens => manager.openAllExternal(candidateScreens)}
    />
  );
}

export default WorkspaceOperationLauncher;
