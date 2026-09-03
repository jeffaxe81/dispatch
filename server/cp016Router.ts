import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertPermission, assertTeamScope } from "./accessControl";
import { assertOwnTeam } from "./authorization";
import { protectedProcedure, router } from "./_core/trpc";
import { listEmbeddedIntegrationsForAdministration, listEmbeddedIntegrationsForRole, saveEmbeddedIntegration } from "./embeddedIntegrationDb";
import { updateTeamShiftCp016 } from "./cp016ShiftDb";

const cp016OperationalProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const cp016Router = router({
  shift: router({
    update: cp016OperationalProcedure
      .input(z.object({ teamId: z.number().int().positive(), action: z.enum(["start", "pause", "resume", "end"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertTeamScope(ctx.user, input.teamId, "teams.manage");
        if (ctx.user.operationalRole === "agente") assertOwnTeam(ctx.user, input.teamId);
        return updateTeamShiftCp016({ ...input, actorUserId: ctx.user.id });
      }),
  }),

  embeddedIntegrations: router({
    listMine: cp016OperationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "integrations.view");
      return listEmbeddedIntegrationsForRole(ctx.user.operationalRole);
    }),

    listAdmin: cp016OperationalProcedure.query(async ({ ctx }) => {
      await assertPermission(ctx.user, "integrations.manage");
      return listEmbeddedIntegrationsForAdministration();
    }),

    save: cp016OperationalProcedure
      .input(z.object({
        code: z.string().trim().min(2).max(100),
        name: z.string().trim().min(2).max(180),
        url: z.string().trim().min(1).max(2048),
        enabled: z.boolean(),
        displayMode: z.enum(["embedded", "fullscreen", "split"]),
        allowedRoles: z.array(z.enum(["operador", "despachador", "agente", "supervisor", "administrador"])).min(1),
        integrationConnectionId: z.number().int().positive().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertPermission(ctx.user, "integrations.manage");
        return saveEmbeddedIntegration({ ...input, actorUserId: ctx.user.id });
      }),
  }),
});
