// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { getWorkspaceWidgetRenderer } from "./widgetRendererRegistry";

describe("D-010C widget renderer registry", () => {
  it("resolves local renderers for known D-010C widget types", () => {
    expect(getWorkspaceWidgetRenderer("kanban")).not.toBeNull();
    expect(getWorkspaceWidgetRenderer("incident-detail")).not.toBeNull();
    expect(getWorkspaceWidgetRenderer("authorized-iframe")).not.toBeNull();
  });

  it("does not resolve arbitrary renderer names", () => {
    expect(getWorkspaceWidgetRenderer("remote-component" as never)).toBeNull();
  });
});
