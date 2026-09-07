import React from "react";
import type { EmbeddedApplication } from "@shared/embeddedApplications";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export function resolveNeoCommunicationApplication(_applications: readonly EmbeddedApplication[]): EmbeddedApplication | null {
  return null;
}

export function NeoCommunicationWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  return <WorkspaceWidgetFrame title="NEO comunicação" state="unavailable" />;
}
