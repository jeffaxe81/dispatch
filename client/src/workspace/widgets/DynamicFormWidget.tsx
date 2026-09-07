import React from "react";
import { trpc } from "@/lib/trpc";
import { FormRenderer } from "@/components/forms/FormRenderer";
import { formSchemaDefinitionSchema, type FormSchemaDefinition } from "@shared/forms";
import { parseWorkspaceWidgetSettings, type WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";
import { useWorkspaceSurfaceContext } from "../context/WorkspaceSurfaceContext";

export type PublishedWorkspaceForm = {
  id: number;
  versionId: number;
  version: number;
  name: string;
  definition: FormSchemaDefinition;
};

export function resolvePublishedWorkspaceForm(value: unknown, formId: number): PublishedWorkspaceForm | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Number(record.id) !== formId || record.versionStatus !== "published") return null;
  const versionId = Number(record.versionId);
  const version = Number(record.version ?? record.currentVersion);
  if (!Number.isInteger(versionId) || versionId <= 0 || !Number.isInteger(version) || version <= 0) return null;
  const definition = formSchemaDefinitionSchema.safeParse(record.definition);
  if (!definition.success) return null;
  return {
    id: formId,
    versionId,
    version,
    name: String(record.name ?? `Formulário #${formId}`),
    definition: definition.data,
  };
}

export function DynamicFormWidget({ widget }: { widget: WorkspaceWidgetInstance }) {
  const settings = parseWorkspaceWidgetSettings("dynamic-form", widget.settings) as { formId?: number };
  const { selection } = useWorkspaceSurfaceContext();
  const formId = settings.formId;
  const query = trpc.forms.get.useQuery(
    { formId: formId ?? 0 },
    { enabled: Boolean(formId && selection.incidentId), retry: false },
  );

  if (!formId) return <WorkspaceWidgetFrame title="Formulário dinâmico" state="empty" />;
  if (!selection.incidentId) return <WorkspaceWidgetFrame title="Formulário dinâmico" state="empty" />;
  if (query.isLoading) return <WorkspaceWidgetFrame title="Formulário dinâmico" state="loading" />;
  if (query.error) return <WorkspaceWidgetFrame title="Formulário dinâmico" state="unavailable" />;
  const form = resolvePublishedWorkspaceForm(query.data, formId);
  if (!form) return <WorkspaceWidgetFrame title="Formulário dinâmico" state="unavailable" />;

  return (
    <WorkspaceWidgetFrame title={form.name}>
      <p className="mb-3 text-xs text-slate-500">Ocorrência selecionada #{selection.incidentId} · versão {form.version}</p>
      <FormRenderer definition={form.definition} values={{}} onChange={() => {}} readOnly attachmentsReadOnly />
    </WorkspaceWidgetFrame>
  );
}
