import React from "react";
import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { WorkspaceSurfaceProvider } from "./context/WorkspaceSurfaceContext";
import { getWorkspaceWidgetDefinition } from "./widgetRegistry";
import { getWorkspaceWidgetRenderer } from "./widgetRendererRegistry";
import { WorkspaceWidgetFrame } from "./WorkspaceWidgetFrame";

class WorkspaceWidgetErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Intencionalmente não propaga mensagem/stack para a superfície operacional.
  }

  render() {
    if (this.state.failed) {
      return <WorkspaceWidgetFrame title={this.props.title} state="error" />;
    }
    return this.props.children;
  }
}

export function WorkspaceScreenCanvas({ screen }: { screen: WorkspaceScreen }) {
  const widgets = screen.widgets
    .map(widget => ({ widget, definition: getWorkspaceWidgetDefinition(widget.type) }))
    .filter((entry): entry is typeof entry & { definition: NonNullable<typeof entry.definition> } => Boolean(entry.definition));

  return (
    <WorkspaceSurfaceProvider>
      <div
        className="grid min-h-[70vh] gap-4"
        style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: "minmax(72px, auto)" }}
        data-testid="workspace-screen-canvas"
      >
        {widgets.map(({ widget, definition }) => {
          const Renderer = getWorkspaceWidgetRenderer(widget.type);
          return (
            <div
              key={widget.instanceId}
              className="min-w-0"
              style={{
                gridColumn: `${Math.max(1, widget.x + 1)} / span ${widget.w}`,
                gridRow: `${Math.max(1, widget.y + 1)} / span ${widget.h}`,
              }}
              data-widget-type={definition.type}
            >
              {Renderer ? (
                <WorkspaceWidgetErrorBoundary title={definition.title}>
                  <Renderer widget={widget} />
                </WorkspaceWidgetErrorBoundary>
              ) : (
                <WorkspaceWidgetFrame title={definition.title} state="empty" />
              )}
            </div>
          );
        })}
      </div>
    </WorkspaceSurfaceProvider>
  );
}
