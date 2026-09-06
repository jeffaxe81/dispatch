import type { WorkspaceScreen } from "@shared/workspaceLayout";
import { getWorkspaceWidgetDefinition } from "./widgetRegistry";

export function WorkspaceScreenCanvas({ screen }: { screen: WorkspaceScreen }) {
  const widgets = screen.widgets
    .map(widget => ({ widget, definition: getWorkspaceWidgetDefinition(widget.type) }))
    .filter((entry): entry is typeof entry & { definition: NonNullable<typeof entry.definition> } => Boolean(entry.definition));

  return (
    <div
      className="grid min-h-[70vh] gap-4"
      style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridAutoRows: "minmax(72px, auto)" }}
      data-testid="workspace-screen-canvas"
    >
      {widgets.map(({ widget, definition }) => (
        <section
          key={widget.instanceId}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          style={{
            gridColumn: `${Math.max(1, widget.x + 1)} / span ${widget.w}`,
            gridRow: `${Math.max(1, widget.y + 1)} / span ${widget.h}`,
          }}
          data-widget-type={definition.type}
        >
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Workspace</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{definition.title}</h2>
        </section>
      ))}
    </div>
  );
}
