// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSurfaceProvider, useWorkspaceSurfaceContext } from "./WorkspaceSurfaceContext";

function Consumer({ label }: { label: string }) {
  const { selection, selectIncident } = useWorkspaceSurfaceContext();
  return (
    <section aria-label={label}>
      <span>{selection.incidentId ?? "none"}</span>
      <button type="button" onClick={() => selectIncident(42)}>select-42</button>
      <button type="button" onClick={() => selectIncident(undefined)}>clear</button>
    </section>
  );
}

describe("D-010C WorkspaceSurfaceContext", () => {
  it("updates sibling consumers within the same surface", () => {
    render(
      <WorkspaceSurfaceProvider>
        <Consumer label="a" />
        <Consumer label="b" />
      </WorkspaceSurfaceProvider>,
    );

    fireEvent.click(within(screen.getByRole("region", { name: "a" })).getByRole("button", { name: "select-42" }));
    expect(within(screen.getByRole("region", { name: "a" })).getByText("42")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "b" })).getByText("42")).toBeTruthy();
  });

  it("does not leak selection between different surfaces", () => {
    render(
      <>
        <WorkspaceSurfaceProvider><Consumer label="surface-a" /></WorkspaceSurfaceProvider>
        <WorkspaceSurfaceProvider><Consumer label="surface-b" /></WorkspaceSurfaceProvider>
      </>,
    );

    fireEvent.click(within(screen.getByRole("region", { name: "surface-a" })).getByRole("button", { name: "select-42" }));
    expect(within(screen.getByRole("region", { name: "surface-a" })).getByText("42")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "surface-b" })).getByText("none")).toBeTruthy();
  });

  it("exposes no tenant or user authority in client surface context", () => {
    function Inspector() {
      const context = useWorkspaceSurfaceContext() as Record<string, unknown>;
      return <span>{Object.keys(context).sort().join(",")}</span>;
    }
    render(<WorkspaceSurfaceProvider><Inspector /></WorkspaceSurfaceProvider>);
    expect(screen.getByText("selectIncident,selection")).toBeTruthy();
  });
});
