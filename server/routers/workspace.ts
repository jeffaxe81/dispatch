import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TrpcContext } from "../_core/context";
import { protectedProcedure, router } from "../_core/trpc";
import {
  workspaceLayoutSchema,
  workspaceLayoutV2Schema,
  type WorkspaceLayoutV2,
} from "@shared/workspaceLayout";
import type { WorkspaceAccessContext } from "../workspace/workspaceLayoutService";

export type WorkspaceRouterService = {
  getOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayoutV2>;
  saveOwnWorkspace(context: WorkspaceAccessContext, name: string, input: unknown): Promise<WorkspaceLayoutV2>;
  resetOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayoutV2>;
};

export type WorkspaceRouterDependencies = {
  resolveAccessContext(ctx: TrpcContext): Promise<WorkspaceAccessContext>;
  service: WorkspaceRouterService;
};

const workspaceNameInput = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

const workspaceSaveInput = workspaceNameInput.extend({
  layout: z.union([workspaceLayoutSchema, workspaceLayoutV2Schema]),
}).strict();

const workspaceScreenInput = z.object({
  name: z.string().trim().min(1).max(80),
  screenId: z.string().trim().min(1).max(120),
}).strict();

export function createWorkspaceRouter(dependencies: WorkspaceRouterDependencies) {
  return router({
    getOwn: protectedProcedure
      .input(workspaceNameInput)
      .query(async ({ ctx, input }) => {
        const accessContext = await dependencies.resolveAccessContext(ctx);
        return dependencies.service.getOwnWorkspace(accessContext, input.name);
      }),

    getOwnScreen: protectedProcedure
      .input(workspaceScreenInput)
      .query(async ({ ctx, input }) => {
        const accessContext = await dependencies.resolveAccessContext(ctx);
        const layout = await dependencies.service.getOwnWorkspace(accessContext, input.name);
        const screen = layout.screens.find(candidate => candidate.screenId === input.screenId);
        if (!screen) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Superfície de workspace não encontrada." });
        }
        return screen;
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
