import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceExternalScreenView, parseWorkspaceExternalSearch } from "./WorkspaceExternalScreenPage";

const surface = {
  screenId: "screen-2",
  name: "Mapa",
  order: 1,
  mode: "external" as const,
  widgets: [
    { instanceId: "map-1", type: "operational-map" as const, x: 0, y: 0, w: 8, h: 6, settings: {} },
  ],
};

describe("WorkspaceExternalScreenPage", () => {
  it("accepts only workspace and screen query parameters", () => {
    expect(parseWorkspaceExternalSearch("?workspace=default&screen=screen-2")).toEqual({
      workspace: "default",
      screenId: "screen-2",
    });
    expect(parseWorkspaceExternalSearch("?workspace=default&screen=screen-2&tenantId=99")).toBeNull();
    expect(parseWorkspaceExternalSearch("?workspace=default&screen=screen-2&userId=7")).toBeNull();
  });

  it("rejects missing or malformed parameters", () => {
    expect(parseWorkspaceExternalSearch("?workspace=default")).toBeNull();
    expect(parseWorkspaceExternalSearch("?screen=screen-2")).toBeNull();
    expect(parseWorkspaceExternalSearch("?workspace=&screen=screen-2")).toBeNull();
    expect(parseWorkspaceExternalSearch("?workspace=default&screen=")).toBeNull();
  });

  it("renders only the selected authorized surface", () => {
    render(<WorkspaceExternalScreenView state="ready" screen={surface} />);
    expect(screen.getByRole("heading", { name: "Mapa" })).toBeTruthy();
    expect(screen.getByText("Mapa operacional")).toBeTruthy();
    expect(screen.queryByText("Indicadores")).toBeNull();
  });

  it("shows a safe unavailable fallback for missing surface", () => {
    render(<WorkspaceExternalScreenView state="unavailable" />);
    expect(screen.getByText("Superfície indisponível")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar à tela principal" }).getAttribute("href")).toBe("/");
  });

  it("shows an authentication-safe fallback for invalid session", () => {
    render(<WorkspaceExternalScreenView state="unauthorized" />);
    expect(screen.getByText("Sessão indisponível")).toBeTruthy();
    expect(screen.queryByText(/stack/i)).toBeNull();
  });
});
