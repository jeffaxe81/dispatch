import React from "react";
import type { FormSchemaDefinition } from "@shared/forms";
import type { WorkspaceWidgetInstance } from "@shared/workspaceLayout";
import { WorkspaceWidgetFrame } from "../WorkspaceWidgetFrame";

export type PublishedWorkspaceForm = {
  id: number;
  versionId: number;
  version: number;
  name: string;
  definition: FormSchemaDefinition;
};

export function resolvePublishedWorkspaceForm(_value: unknown, _formId: number): PublishedWorkspaceForm | null {
  return null;
}

export function DynamicFormWidget({ widget: _widget }: { widget: WorkspaceWidgetInstance }) {
  return <WorkspaceWidgetFrame title="Formulário dinâmico" state="unavailable" />;
}
