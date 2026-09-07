import React from "react";
import { trpc } from "@/lib/trpc";
import { EmbeddedApplicationFrame } from "@/components/EmbeddedApplicationFrame";
import type { EmbeddedApplication } from "@shared/embeddedApplications";
import { parseWorkspaceWidgetSettings, type WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export function resolveAuthorizedIframeApplication(
  applications: readonly EmbeddedApplication[],
  applicationId: string,
): EmbeddedApplication | null {
  return applications.find(application => application.id === applicationId && application.enabled) ?? null;
}

export function AuthorizedIframeWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = parseWorkspaceWidgetSettings("authorized-iframe", widget.settings) as { applicationId: string };
  const query = trpc.integrations.embeddedApplications.list.useQuery();
  if (query.isLoading) return <WorkspaceWidgetFrame title="Aplicação incorporada" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Aplicação incorporada" state="error" error={query.error} />;
  const application = resolveAuthorizedIframeApplication((query.data ?? []) as EmbeddedApplication[], settings.applicationId);
  if (!application) return <WorkspaceWidgetFrame title="Aplicação incorporada" state="unavailable" />;
  return (
    <WorkspaceWidgetFrame title={application.name}>
      <EmbeddedApplicationFrame application={application} />
    </WorkspaceWidgetFrame>
  );
}
