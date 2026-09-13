export const workflowTaskAssignmentTypes = ["user", "team", "role"] as const;
export type WorkflowTaskAssignmentType = (typeof workflowTaskAssignmentTypes)[number];

export const workflowTaskStatuses = ["open", "in_progress", "completed", "cancelled"] as const;
export type WorkflowTaskStatus = (typeof workflowTaskStatuses)[number];

export const workflowTaskOperationalRoles = [
  "operador",
  "despachador",
  "agente",
  "supervisor",
  "administrador",
] as const;
export type WorkflowTaskOperationalRole = (typeof workflowTaskOperationalRoles)[number];

export type WorkflowTaskAssignment = {
  type: WorkflowTaskAssignmentType;
  userId: number | null;
  teamId: number | null;
  role: WorkflowTaskOperationalRole | null;
};

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasMeaningfulValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function parseHumanTaskAssignment(input: Record<string, unknown>): WorkflowTaskAssignment {
  const assignmentType = input.assignmentType;
  if (!workflowTaskAssignmentTypes.includes(assignmentType as WorkflowTaskAssignmentType)) {
    throw new Error("assignmentType deve ser user, team ou role.");
  }

  const rawUserId = input.assigneeUserId;
  const rawTeamId = input.assigneeTeamId;
  const rawRole = input.assigneeRole;

  if (assignmentType === "user") {
    const userId = positiveInteger(rawUserId);
    if (!userId) throw new Error("assigneeUserId deve ser um inteiro positivo.");
    if (hasMeaningfulValue(rawTeamId) || hasMeaningfulValue(rawRole)) {
      throw new Error("A tarefa humana deve possuir exatamente um responsável.");
    }
    return { type: "user", userId, teamId: null, role: null };
  }

  if (assignmentType === "team") {
    const teamId = positiveInteger(rawTeamId);
    if (!teamId) throw new Error("assigneeTeamId deve ser um inteiro positivo.");
    if (hasMeaningfulValue(rawUserId) || hasMeaningfulValue(rawRole)) {
      throw new Error("A tarefa humana deve possuir exatamente um responsável.");
    }
    return { type: "team", userId: null, teamId, role: null };
  }

  const role = nonEmptyString(rawRole);
  if (!role) throw new Error("assigneeRole é obrigatório.");
  if (!workflowTaskOperationalRoles.includes(role as WorkflowTaskOperationalRole)) {
    throw new Error("assigneeRole não corresponde a um papel operacional suportado.");
  }
  if (hasMeaningfulValue(rawUserId) || hasMeaningfulValue(rawTeamId)) {
    throw new Error("A tarefa humana deve possuir exatamente um responsável.");
  }
  return { type: "role", userId: null, teamId: null, role: role as WorkflowTaskOperationalRole };
}

export function isWorkflowTaskClaimEligible(
  assignment: WorkflowTaskAssignment,
  user: { id: number; active: boolean; teamId: number | null; operationalRole: string },
): boolean {
  if (!user.active) return false;
  if (assignment.type === "user") return assignment.userId === user.id;
  if (assignment.type === "team") return assignment.teamId !== null && assignment.teamId === user.teamId;
  return assignment.role !== null && assignment.role === user.operationalRole;
}
