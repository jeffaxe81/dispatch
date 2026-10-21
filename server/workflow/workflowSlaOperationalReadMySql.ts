import type { WorkflowSlaOperationalReadStore } from "./workflowSlaOperationalReadModel";

export function createWorkflowSlaOperationalReadMySql(_db: unknown): WorkflowSlaOperationalReadStore {
  return {
    async list() {
      throw new Error("D-012J MySQL read store ainda não implementado.");
    },
  };
}
