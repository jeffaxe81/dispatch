import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import { WorkspaceScreensEditor } from "./WorkspaceScreensEditor";

function layout(): WorkspaceLayoutV2 {
  return {
    id: "workspace-default",
    name: "default",
    version: 2,
    screens: [
      {
        screenId: "primary",
        name: "Central",
        order: 0,
        mode: "primary",
        widgets: [
          { instanceId: "map-1", type: "operational-map", x: 0, y: 0, w: 12, h: 8, settings: {} },
        ],
      },
      { screenId: "ops-2", name: "Supervisão", order: 1, mode: "external", widgets: [] },
    ],
  };
}

describe("WorkspaceScreensEditor UI", () => {
  it("renomeia a superfície ativa e permite torná-la principal no rascunho", () => {
    render(<WorkspaceScreensEditor loadedLayout={layout()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Supervisão/ }));
    fireEvent.change(screen.getByLabelText("Nome da superfície"), { target: { value: "Coordenação" } });
    fireEvent.click(screen.getByRole("button", { name: "Renomear superfície" }));
    fireEvent.click(screen.getByRole("button", { name: "Definir como principal" }));

    expect(screen.getByRole("tab", { name: /Coordenação/ }).textContent).toContain("Principal");
  });

  it("cria nova superfície externa e a seleciona", () => {
    render(<WorkspaceScreensEditor loadedLayout={layout()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome da nova superfície"), { target: { value: "Comunicação" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar superfície" }));

    expect(screen.getByRole("tab", { name: /Comunicação/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("move widget para outra superfície e salva apenas quando solicitado", () => {
    const onSave = vi.fn();
    render(<WorkspaceScreensEditor loadedLayout={layout()} onSave={onSave} />);

    const widgetRow = screen.getByTestId("workspace-widget-editor-map-1");
    fireEvent.change(within(widgetRow).getByLabelText("Mover widget"), { target: { value: "ops-2" } });
    fireEvent.click(within(widgetRow).getByRole("button", { name: "Mover" }));
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as WorkspaceLayoutV2;
    expect(saved.screens.find(item => item.screenId === "ops-2")?.widgets.map(widget => widget.instanceId)).toEqual(["map-1"]);
  });

  it("remove superfície com widgets somente após escolher realocação", () => {
    const loaded = layout();
    loaded.screens[1].widgets.push({ instanceId: "metrics-1", type: "metrics", x: 0, y: 0, w: 6, h: 4, settings: {} });
    render(<WorkspaceScreensEditor loadedLayout={loaded} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Supervisão/ }));

    expect(screen.getByRole("button", { name: "Remover superfície" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Realocar widgets para"), { target: { value: "primary" } });
    expect(screen.getByRole("button", { name: "Remover superfície" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remover superfície" }));
    expect(screen.queryByRole("tab", { name: /Supervisão/ })).toBeNull();
  });
});
