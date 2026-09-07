import React, { useEffect, useMemo, useState } from "react";
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

function nextScreenId(layout: WorkspaceLayoutV2): string {
  let index = layout.screens.length + 1;
  while (layout.screens.some(screen => screen.screenId === `screen-${index}`)) index += 1;
  return `screen-${index}`;
}

export function addScreen(
  layout: WorkspaceLayoutV2,
  input: { screenId: string; name: string },
): WorkspaceLayoutV2 {
  const screenId = input.screenId.trim();
  const name = input.name.trim();
  if (!screenId || !name) throw new Error("WORKSPACE_SCREEN_INVALID");
  if (layout.screens.some(screen => screen.screenId === screenId)) throw new Error("WORKSPACE_SCREEN_DUPLICATE");

  const next = cloneLayout(layout);
  next.screens = normalizeOrders([
    ...next.screens,
    { screenId, name, order: next.screens.length, mode: "external", widgets: [] },
  ]);
  return validate(next);
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
  const [newScreenName, setNewScreenName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [relocationTarget, setRelocationTarget] = useState("");
  const [widgetTargets, setWidgetTargets] = useState<Record<string, string>>({});

  const effectiveActiveScreenId = draft.screens.some(screen => screen.screenId === activeScreenId)
    ? activeScreenId
    : orderedScreens[0]?.screenId ?? "";
  const activeScreen = draft.screens.find(screen => screen.screenId === effectiveActiveScreenId);
  const activeIndex = orderedScreens.findIndex(screen => screen.screenId === effectiveActiveScreenId);
  const otherScreens = orderedScreens.filter(screen => screen.screenId !== effectiveActiveScreenId);

  useEffect(() => {
    setRenameValue(activeScreen?.name ?? "");
    setRelocationTarget("");
  }, [activeScreen?.screenId, activeScreen?.name]);

  const cancel = () => {
    const restored = cloneLayout(loadedLayout);
    setDraft(restored);
    setActiveScreenId([...restored.screens].sort((a, b) => a.order - b.order)[0]?.screenId ?? "");
    setNewScreenName("");
    setWidgetTargets({});
    onCancel?.();
  };

  const createSurface = () => {
    const name = newScreenName.trim();
    if (!name) return;
    const screenId = nextScreenId(draft);
    const next = addScreen(draft, { screenId, name });
    setDraft(next);
    setActiveScreenId(screenId);
    setNewScreenName("");
  };

  const renameActive = () => {
    if (!activeScreen) return;
    setDraft(renameScreen(draft, activeScreen.screenId, renameValue));
  };

  const makePrimary = () => {
    if (!activeScreen) return;
    setDraft(setPrimaryScreen(draft, activeScreen.screenId));
  };

  const shiftActive = (targetIndex: number) => {
    if (!activeScreen) return;
    setDraft(reorderScreen(draft, activeScreen.screenId, targetIndex));
  };

  const moveWidget = (instanceId: string) => {
    const target = widgetTargets[instanceId];
    if (!target) return;
    setDraft(moveWidgetToScreen(draft, instanceId, target));
    setWidgetTargets(current => ({ ...current, [instanceId]: "" }));
  };

  const removeActive = () => {
    if (!activeScreen || draft.screens.length <= 1) return;
    const next = removeScreen(
      draft,
      activeScreen.screenId,
      activeScreen.widgets.length > 0 ? { relocateWidgetsToScreenId: relocationTarget } : undefined,
    );
    setDraft(next);
    setActiveScreenId([...next.screens].sort((a, b) => a.order - b.order)[0]?.screenId ?? "");
  };

  const canRemove = Boolean(
    activeScreen
    && draft.screens.length > 1
    && (activeScreen.widgets.length === 0 || relocationTarget),
  );

  return (
    <section aria-label="Editor de superfícies do workspace" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Superfícies operacionais</h2>
          <p className="text-sm text-slate-500">As alterações ficam em rascunho até salvar.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={cancel}>Cancelar</button>
          <button type="button" onClick={() => void onSave(validate(cloneLayout(draft)))}>Salvar</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
            Nome da nova superfície
            <input
              value={newScreenName}
              onChange={event => setNewScreenName(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <button type="button" onClick={createSurface} disabled={!newScreenName.trim()}>
            Adicionar superfície
          </button>
        </div>
      </div>

      <WorkspaceCanvas
        layout={draft}
        activeScreenId={effectiveActiveScreenId}
        onSelectScreen={setActiveScreenId}
      />

      {activeScreen ? (
        <section aria-label="Controles da superfície ativa" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
              Nome da superfície
              <input
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <button type="button" onClick={renameActive} disabled={!renameValue.trim()}>
              Renomear superfície
            </button>
            <button type="button" onClick={makePrimary} disabled={activeScreen.mode === "primary"}>
              Definir como principal
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => shiftActive(activeIndex - 1)} disabled={activeIndex <= 0}>
              Mover para esquerda
            </button>
            <button type="button" onClick={() => shiftActive(activeIndex + 1)} disabled={activeIndex < 0 || activeIndex >= orderedScreens.length - 1}>
              Mover para direita
            </button>
          </div>

          {activeScreen.widgets.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Widgets nesta superfície</h3>
              {activeScreen.widgets.map(widget => (
                <div key={widget.instanceId} data-testid={`workspace-widget-editor-${widget.instanceId}`} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-44 flex-1 text-sm text-slate-700">{widget.type}</div>
                  <label className="flex min-w-52 flex-col gap-1 text-xs font-medium text-slate-600">
                    Mover widget
                    <select
                      value={widgetTargets[widget.instanceId] ?? ""}
                      onChange={event => setWidgetTargets(current => ({ ...current, [widget.instanceId]: event.target.value }))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2"
                    >
                      <option value="">Escolha uma superfície</option>
                      {otherScreens.map(screen => <option key={screen.screenId} value={screen.screenId}>{screen.name}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => moveWidget(widget.instanceId)} disabled={!widgetTargets[widget.instanceId]}>
                    Mover
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {draft.screens.length > 1 ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
              {activeScreen.widgets.length > 0 ? (
                <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
                  Realocar widgets para
                  <select
                    value={relocationTarget}
                    onChange={event => setRelocationTarget(event.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">Escolha uma superfície</option>
                    {otherScreens.map(screen => <option key={screen.screenId} value={screen.screenId}>{screen.name}</option>)}
                  </select>
                </label>
              ) : null}
              <button type="button" onClick={removeActive} disabled={!canRemove}>
                Remover superfície
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

export default WorkspaceScreensEditor;
