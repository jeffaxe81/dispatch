import React, { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";

export type WorkspaceScreenTabsProps = {
  screens: WorkspaceScreen[];
  activeScreenId: string;
  onSelect(screenId: string): void;
};

export function WorkspaceScreenTabs({ screens, activeScreenId, onSelect }: WorkspaceScreenTabsProps) {
  const orderedScreens = useMemo(() => [...screens].sort((a, b) => a.order - b.order), [screens]);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const effectiveActiveId = orderedScreens.some(screen => screen.screenId === activeScreenId)
    ? activeScreenId
    : orderedScreens[0]?.screenId;

  const selectAndFocus = (screenId: string) => {
    onSelect(screenId);
    tabRefs.current[screenId]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (orderedScreens.length === 0) return;

    let targetIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = (currentIndex + 1) % orderedScreens.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = (currentIndex - 1 + orderedScreens.length) % orderedScreens.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = orderedScreens.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    selectAndFocus(orderedScreens[targetIndex].screenId);
  };

  return (
    <div role="tablist" aria-label="Superfícies do workspace" className="flex flex-wrap gap-2">
      {orderedScreens.map((screen, index) => {
        const selected = screen.screenId === effectiveActiveId;
        return (
          <button
            key={screen.screenId}
            ref={element => { tabRefs.current[screen.screenId] = element; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-screen-id={screen.screenId}
            onClick={() => onSelect(screen.screenId)}
            onKeyDown={event => handleKeyDown(event, index)}
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
