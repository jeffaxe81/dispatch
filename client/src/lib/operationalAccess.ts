export type AccessAssignmentLike = { roleCode?: string };

export function isFieldAgent(operationalRole?: string, assignments?: AccessAssignmentLike[]) {
  return operationalRole === "agente" || (assignments ?? []).some(assignment => assignment.roleCode === "agente_campo");
}
