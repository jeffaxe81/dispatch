import React, { useMemo, useState } from "react";
import type { WorkspaceLayoutV2, WorkspaceScreen } from "@shared/workspaceLayout";
import { workspaceLayoutV2Schema } from "@shared/workspaceLayout";
import { WorkspaceCanvas } from "../WorkspaceCanvas";

function normalizeOrders(screens: WorkspaceScreen[]): WorkspaceScreen[] {
  return screens.map((screen, index) => ({ ...screen, order: index }));
}

function validate(layout: WorkspaceLayoutV2): WorkspaceLayoutV2 {
  return workspaceLayoutV2Schema.parse(layout);
}

function cloneLayout(layout: WorkspaceLayoutV2): WorkspaceLayoutV2 {
  return {
    ...layout,
    screens: layout.screens.map(screen => ({
      ...screen,
      preferredDisplay: screen.preferredDisplay ? { ...screen.preferredDisplay } : undefined,
      widgets: screen.widgets.map(widget => ({ ...widget, settings: { ...widget.settings } })),
    })),
  };
}

export function addScreen(
  layout: WorkspaceLayoutV2,
  input: { screenId: string; name: string },
): WorkspaceLayoutV2 {
  const screenId = input.screenId.trim();
  const name = input.name.trim();
  if (!screenId || !name) throw new Error("WORKSPACE_SCREEN_INVALID");
  if (layout.screens.some(screen => screen.screenId === screenId)) throw new Error("WORKSPACE_SCREEN_DUPLICATE");

  return validate({
    ...cloneLayout(layout),
    screens: normalizeOrders([
      ...cloneLayout(layout).screens,
      { screenId, name, order: layout.screens.length, mode: "external", widgets: [] },
    ]),
  });
}

export function renameScreen(layout: WorkspaceLayoutV2, screenId: string, name: string): WorkspaceLayoutV2 {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("WORKSPACE_SCREEN_NAME_INVALID");
  let found = false;
  const next = cloneLayout(layout);
  next.screens = next.screens.map(screen => {
    if (screen.screenId !== screenId) return screen;
    found = true;
    return { ...screen, name: normalizedName };
  });
  if (!found) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
  return validate(next);
}

export function reorderScreen(layout: WorkspaceLayoutV2, screenId: string, targetIndex: number): WorkspaceLayoutV2 {
  if (!Number.isInteger(targetIndex)) throw new Error("WORKSPACE_SCREEN_ORDER_INVALID");
  const next = cloneLayout(layout);
  const currentIndex = next.screens.findIndex(screen => screen.screenId === screenId);
  if (currentIndex < 0) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
  const [screen] = next.screens.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(targetIndex, next.screens.length));
  next.screens.splice(boundedIndex, 0, screen);
  next.screens = normalizeOrders(next.screens);
  return validate(next);
}

export function setPrimaryScreen(layout: WorkspaceLayoutV2, screenId: string): WorkspaceLayoutV2 {
  if (!layout.screens.some(screen => screen.screenId === screenId)) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
  const next = cloneLayout(layout);
  next.screens = next.screens.map(screen => ({
    ...screen,
    mode: screen.screenId === screenId ? "primary" : "external",
  }));
  return validate(next);
}

export function setExternalScreen(layout: WorkspaceLayoutV2, screenId: string): WorkspaceLayoutV2 {
  const screen = layout.screens.find(candidate => candidate.screenId === screenId);
  if (!screen) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
  if (screen.mode === "primary") throw new Error("WORKSPACE_PRIMARY_REQUIRED");
  return cloneLayout(layout);
}

export function moveWidgetToScreen(
  layout: WorkspaceLayoutV2,
  instanceId: string,
  targetScreenId: string,
): WorkspaceLayoutV2 {
  const next = cloneLayout(layout);
  const target = next.screens.find(screen => screen.screenId === targetScreenId);
  if (!target) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");

  let movedWidget: WorkspaceScreen["widgets"][number] | undefined;
  for (const screen of next.screens) {
    const index = screen.widgets.findIndex(widget => widget.instanceId === instanceId);
    if (index >= 0) {
      [movedWidget] = screen.widgets.splice(index, 1);
      break;
    }
  }
  if (!movedWidget) throw new Error("WORKSPACE_WIDGET_NOT_FOUND");
  if (target.widgets.some(widget => widget.instanceId === instanceId)) throw new Error("WORKSPACE_WIDGET_DUPLICATE");
  target.widgets.push(movedWidget);
  return validate(next);
}

export function removeScreen(
  layout: WorkspaceLayoutV2,
  screenId: string,
  options?: { relocateWidgetsToScreenId?: string },
): WorkspaceLayoutV2 {
  if (layout.screens.length <= 1) throw new Error("WORKSPACE_REQUIRES_SCREEN");
  const next = cloneLayout(layout);
  const index = next.screens.findIndex(screen => screen.screenId === screenId);
  if (index < 0) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
  const screen = next.screens[index];

  if (screen.widgets.length > 0) {
    const relocateTo = options?.relocateWidgetsToScreenId;
    if (!relocateTo) throw new Error("WORKSPACE_SCREEN_HAS_WIDGETS");
    if (relocateTo === screenId) throw new Error("WORKSPACE_SCREEN_RELOCATION_INVALID");
    const target = next.screens.find(candidate => candidate.screenId === relocateTo);
    if (!target) throw new Error("WORKSPACE_SCREEN_NOT_FOUND");
    const targetIds = new Set(target.widgets.map(widget => widget.instanceId));
    if (screen.widgets.some(widget => targetIds.has(widget.instanceId))) throw new Error("WORKSPACE_WIDGET_DUPLICATE");
    target.widgets.push(...screen.widgets);
  }

  next.screens.splice(index, 1);
  next.screens = normalizeOrders(next.screens);
  if (screen.mode === "primary") {
    next.screens = next.screens.map((candidate, candidateIndex) => ({
      ...candidate,
      mode: candidateIndex === 0 ? "primary" : "external",
    }));
  }
  return validate(next);
}

export type WorkspaceScreensEditorProps = {
  loadedLayout: WorkspaceLayoutV2;
  onSave(layout: WorkspaceLayoutV2): void | Promise<void>;
  onCancel?(): void;
};

export function WorkspaceScreensEditor({ loadedLayout, onSave, onCancel }: WorkspaceScreensEditorProps) {
  const [draft, setDraft] = useState<WorkspaceLayoutV2>(() => cloneLayout(loadedLayout));
  const orderedScreens = useMemo(() => [...draft.screens].sort((a, b) => a.order - b.order), [draft]);
  const [activeScreenId, setActiveScreenId] = useState(() => orderedScreens[0]?.screenId ?? "");

  const cancel = () => {
    const restored = cloneLayout(loadedLayout);
    setDraft(restored);
    setActiveScreenId([...restored.screens].sort((a, b) => a.order - b.order)[0]?.screenId ?? "");
    onCancel?.();
  };

  const effectiveActiveScreenId = draft.screens.some(screen => screen.screenId === activeScreenId)
    ? activeScreenId
    : orderedScreens[0]?.screenId ?? "";

  return (
    <section aria-label="Editor de superfícies do workspace" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Superfícies operacionais</h2>
          <p className="text-sm text-slate-500">As alterações ficam em rascunho até salvar.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={cancel}>Cancelar</button>
          <button type="button" onClick={() => void onSave(validate(cloneLayout(draft)))}>Salvar</button>
        </div>
      </div>

      <WorkspaceCanvas
        layout={draft}
        activeScreenId={effectiveActiveScreenId}
        onSelectScreen={setActiveScreenId}
      />
    </section>
  );
}

export default WorkspaceScreensEditor;
