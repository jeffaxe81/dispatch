export type WorkflowVersionPublicationState = {
  currentVersion: number;
  publishedVersion: number | null;
  active: boolean;
};

export type WorkflowPublicationLifecycle = "draft" | "published" | "disabled";

export type WorkflowPublicationProjection = {
  lifecycle: WorkflowPublicationLifecycle;
  hasDraftChanges: boolean;
};

function assertPositiveVersion(value: number, field: "currentVersion" | "publishedVersion") {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} deve ser um inteiro positivo.`);
  }
}

export function assertWorkflowVersionPublicationState(state: WorkflowVersionPublicationState) {
  assertPositiveVersion(state.currentVersion, "currentVersion");
  if (state.publishedVersion !== null) {
    assertPositiveVersion(state.publishedVersion, "publishedVersion");
    if (state.publishedVersion > state.currentVersion) {
      throw new Error("publishedVersion não pode superar currentVersion.");
    }
  }
  if (state.active && state.publishedVersion === null) {
    throw new Error("publishedVersion é obrigatório para uma publicação ativa.");
  }
  return state;
}

export function projectWorkflowPublicationState(state: WorkflowVersionPublicationState): WorkflowPublicationProjection {
  assertWorkflowVersionPublicationState(state);
  if (state.publishedVersion === null) {
    return { lifecycle: "draft", hasDraftChanges: true };
  }
  return {
    lifecycle: state.active ? "published" : "disabled",
    hasDraftChanges: state.currentVersion !== state.publishedVersion,
  };
}

export function nextWorkflowDraftVersion(state: WorkflowVersionPublicationState): WorkflowVersionPublicationState {
  assertWorkflowVersionPublicationState(state);
  return {
    ...state,
    currentVersion: state.currentVersion + 1,
  };
}

export function publishCurrentWorkflowVersion(state: WorkflowVersionPublicationState): WorkflowVersionPublicationState {
  assertPositiveVersion(state.currentVersion, "currentVersion");
  if (state.publishedVersion !== null) assertPositiveVersion(state.publishedVersion, "publishedVersion");
  if (state.publishedVersion !== null && state.publishedVersion > state.currentVersion) {
    throw new Error("publishedVersion não pode superar currentVersion.");
  }
  return {
    currentVersion: state.currentVersion,
    publishedVersion: state.currentVersion,
    active: true,
  };
}

export function disableWorkflowPublication(state: WorkflowVersionPublicationState): WorkflowVersionPublicationState {
  assertWorkflowVersionPublicationState(state);
  return {
    ...state,
    active: false,
  };
}

export function resolvePublishedWorkflowVersion(state: WorkflowVersionPublicationState): number | null {
  assertWorkflowVersionPublicationState(state);
  if (!state.active) return null;
  return state.publishedVersion;
}
