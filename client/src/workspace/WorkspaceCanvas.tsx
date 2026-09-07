import React, { useMemo } from "react";
import type { WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import { WorkspaceScreenCanvas } from "./WorkspaceScreenCanvas";
import { WorkspaceScreenTabs } from "./multimonitor/WorkspaceScreenTabs";

export type WorkspaceCanvasProps = {
  layout: WorkspaceLayoutV2;
  activeScreenId: string;
  onSelectScreen(screenId: string): void;
};

export function WorkspaceCanvas({ layout, activeScreenId, onSelectScreen }: WorkspaceCanvasProps) {
  const orderedScreens = useMemo(
    () => [...layout.screens].sort((a, b) => a.order - b.order),
    [layout],
  );
  const activeScreen = orderedScreens.find(screen => screen.screenId === activeScreenId) ?? orderedScreens[0];

  if (!activeScreen) {
    return (
      <section aria-label="Workspace operacional" className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Workspace indisponível</h2>
        <p className="mt-1 text-sm text-slate-500">Nenhuma superfície operacional está configurada.</p>
      </section>
    );
  }

  return (
    <section aria-label="Workspace operacional" className="space-y-4">
      <WorkspaceScreenTabs
        screens={orderedScreens}
        activeScreenId={activeScreen.screenId}
        onSelect={onSelectScreen}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{activeScreen.name}</h2>
          <p className="text-xs text-slate-500">
            {activeScreen.mode === "primary" ? "Superfície principal" : "Superfície externa"}
          </p>
        </div>
      </div>
      <WorkspaceScreenCanvas screen={activeScreen} />
    </section>
  );
}

export default WorkspaceCanvas;
