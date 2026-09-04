import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDatabaseWorkShiftStatus, runDatabaseWorkShiftCommand } from "./workShiftRuntime";

const workShiftProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.active) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Usuário operacional inativo." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function mapWorkShiftError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message.startsWith("transicao_invalida:")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Transição de jornada inválida." });
    }
    if (error.message === "jornada_ativa_nao_encontrada") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Jornada ativa não encontrada." });
    }
  }
  throw error;
}

function commandProcedure(type: "iniciar" | "iniciar_intervalo" | "retomar" | "encerrar") {
  return workShiftProcedure.mutation(async ({ ctx }) => {
    try {
      return await runDatabaseWorkShiftCommand({
        userId: ctx.user.id,
        actorUserId: ctx.user.id,
        command: { type, at: new Date() },
      });
    } catch (error) {
      return mapWorkShiftError(error);
    }
  });
}

export const workShiftRouter = router({
  current: workShiftProcedure.query(({ ctx }) => getDatabaseWorkShiftStatus(ctx.user.id)),
  start: commandProcedure("iniciar"),
  break: commandProcedure("iniciar_intervalo"),
  resume: commandProcedure("retomar"),
  end: commandProcedure("encerrar"),
});
