import React from "react";
import { trpc } from "@/lib/trpc";
import { EmbeddedApplicationFrame } from "@/components/EmbeddedApplicationFrame";
import type { EmbeddedApplication } from "@shared/embeddedApplications";
import { parseWorkspaceWidgetSettings, type WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export function resolveNeoCommunicationApplication(applications: readonly EmbeddedApplication[]): EmbeddedApplication | null {
  return applications.find(application => application.id === "neo-interact" && application.enabled) ?? null;
}

export function NeoCommunicationWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = parseWorkspaceWidgetSettings("neo-communication", widget.settings) as { applicationId: "neo-interact" };
  const query = trpc.integrations.embeddedApplications.list.useQuery();
  if (query.isLoading) return <WorkspaceWidgetFrame title="NEO comunicação" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="NEO comunicação" state="error" error={query.error} />;
  if (settings.applicationId !== "neo-interact") return <WorkspaceWidgetFrame title="NEO comunicação" state="unavailable" />;
  const application = resolveNeoCommunicationApplication((query.data ?? []) as EmbeddedApplication[]);
  if (!application) return <WorkspaceWidgetFrame title="NEO comunicação" state="unavailable" />;
  return (
    <WorkspaceWidgetFrame title="NEO comunicação">
      <EmbeddedApplicationFrame application={application} />
    </WorkspaceWidgetFrame>
  );
}
