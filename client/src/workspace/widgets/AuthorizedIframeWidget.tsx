import React from "react";
import type { EmbeddedApplication } from "@shared/embeddedApplications";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export function resolveAuthorizedIframeApplication(
  _applications: readonly EmbeddedApplication[],
  _applicationId: string,
): EmbeddedApplication | null {
  return null;
}

export function AuthorizedIframeWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  return <WorkspaceWidgetFrame title="Aplicação incorporada" state="unavailable" />;
}
