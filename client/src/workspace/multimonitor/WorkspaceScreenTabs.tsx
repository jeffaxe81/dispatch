import React, { useMemo } from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";

export type WorkspaceScreenTabsProps = {
  screens: WorkspaceScreen[];
  activeScreenId: string;
  onSelect(screenId: string): void;
};

export function WorkspaceScreenTabs({ screens, activeScreenId, onSelect }: WorkspaceScreenTabsProps) {
  const orderedScreens = useMemo(() => [...screens].sort((a, b) => a.order - b.order), [screens]);
  const effectiveActiveId = orderedScreens.some(screen => screen.screenId === activeScreenId)
    ? activeScreenId
    : orderedScreens[0]?.screenId;

  return (
    <div role="tablist" aria-label="Superfícies do workspace" className="flex flex-wrap gap-2">
      {orderedScreens.map(screen => {
        const selected = screen.screenId === effectiveActiveId;
        return (
          <button
            key={screen.screenId}
            type="button"
            role="tab"
            aria-selected={selected}
            data-screen-id={screen.screenId}
            onClick={() => onSelect(screen.screenId)}
            className={selected
              ? "rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900"
              : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"}
          >
            <span>{screen.name}</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {screen.mode === "primary" ? "Principal" : "Externa"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default WorkspaceScreenTabs;
