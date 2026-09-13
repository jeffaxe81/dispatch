import { assertPermission, type AccessAssignment } from "../accessControl";

export const WORKFLOW_PERMISSIONS = {
  view: "workflows.view",
  edit: "workflows.edit",
  publish: "workflows.publish",
  execute: "workflows.execute",
  taskView: "workflow_tasks.view",
  taskAssign: "workflow_tasks.assign",
  taskAct: "workflow_tasks.act",
} as const;

export function isUserAuthorizedForOrganization(assignments: AccessAssignment[], organizationId: number) {
  return assignments.some(assignment => assignment.defaultScope === "global" || assignment.organizationId === organizationId);
}

export async function assertWorkflowPermission(
  user: Parameters<typeof assertPermission>[0],
  action: keyof typeof WORKFLOW_PERMISSIONS,
) {
  return assertPermission(user, WORKFLOW_PERMISSIONS[action]);
}
