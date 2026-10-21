import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export type WorkflowSlaOperationalRouterDependencies = {
  assertPermission(user: any, permission: string): Promise<void>;
  requireActiveTenant(user: any, req: any): Promise<number>;
  list(input: { organizationId: number; limit: number; now: string }): Promise<unknown[]>;
  now(): string;
};

export function createWorkflowSlaOperationalRouter(_deps: WorkflowSlaOperationalRouterDependencies) {
  return router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict())
      .query(async () => {
        throw new Error("D-012J router ainda não implementado.");
      }),
  });
}
