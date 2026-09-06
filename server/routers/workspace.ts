import { z } from "zod";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import { workspaceLayoutSchema, type WorkspaceLayout } from "@shared/workspaceLayout";
import type { WorkspaceAccessContext } from "../workspace/workspaceLayoutService";

export type WorkspaceRouterService = {
  getOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayout>;
  saveOwnWorkspace(context: WorkspaceAccessContext, name: string, input: unknown): Promise<WorkspaceLayout>;
  resetOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayout>;
};

export type WorkspaceRouterDependencies = {
  resolveAccessContext(ctx: TrpcContext): Promise<WorkspaceAccessContext>;
  service: WorkspaceRouterService;
};

const workspaceNameInput = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

const workspaceSaveInput = workspaceNameInput.extend({
  layout: workspaceLayoutSchema,
}).strict();

export function createWorkspaceRouter(dependencies: WorkspaceRouterDependencies) {
  return router({
    getOwn: protectedProcedure
      .input(workspaceNameInput)
      .query(async ({ ctx, input }) => {
        const accessContext = await dependencies.resolveAccessContext(ctx);
        return dependencies.service.getOwnWorkspace(accessContext, input.name);
      }),

    saveOwn: protectedProcedure
      .input(workspaceSaveInput)
      .mutation(async ({ ctx, input }) => {
        const accessContext = await dependencies.resolveAccessContext(ctx);
        return dependencies.service.saveOwnWorkspace(accessContext, input.name, input.layout);
      }),

    resetOwn: protectedProcedure
      .input(workspaceNameInput)
      .mutation(async ({ ctx, input }) => {
        const accessContext = await dependencies.resolveAccessContext(ctx);
        return dependencies.service.resetOwnWorkspace(accessContext, input.name);
      }),
  });
}
