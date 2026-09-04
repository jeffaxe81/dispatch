import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDatabaseWorkShiftStatus, runDatabaseWorkShiftCommand } from "./workShiftRuntime";

const workShiftProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function commandProcedure(type: "iniciar" | "iniciar_intervalo" | "retomar" | "encerrar") {
  return workShiftProcedure.mutation(({ ctx }) =>
    runDatabaseWorkShiftCommand({
      userId: ctx.user.id,
      actorUserId: ctx.user.id,
      command: { type, at: new Date() },
    }),
  );
}

export const workShiftRouter = router({
  current: workShiftProcedure.query(({ ctx }) => getDatabaseWorkShiftStatus(ctx.user.id)),
  start: commandProcedure("iniciar"),
  break: commandProcedure("iniciar_intervalo"),
  resume: commandProcedure("retomar"),
  end: commandProcedure("encerrar"),
});
