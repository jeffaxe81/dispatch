import { getEffectiveAccess } from "./accessControl";
import { getDb } from "./db";
import { createWorkShiftAdjustmentDbStore } from "./workShiftAdjustmentDbStore";
import {
  approveWorkShiftAdjustment,
  rejectWorkShiftAdjustment,
  requestWorkShiftAdjustment,
} from "./workShiftAdjustmentService";
import type {
  WorkShiftAdjustmentActor,
  WorkShiftAdjustmentsRouterDependencies,
} from "./workShiftAdjustmentsRouter";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function resolveActor(user: Parameters<typeof getEffectiveAccess>[0]): Promise<WorkShiftAdjustmentActor> {
  const access = await getEffectiveAccess(user);
  return {
    userId: user.id,
    permissions: access.permissions,
  };
}

export const workShiftAdjustmentsRouterDependencies: WorkShiftAdjustmentsRouterDependencies = {
  resolveActor,

  async list(input) {
    const db = await requireDb();
    return createWorkShiftAdjustmentDbStore(db).listAdjustments(input);
  },

  async request(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAdjustmentDbStore(db);
    const session = await store.getSessionSnapshot(input.sessionId);
    if (!session) throw new Error("Sessão de jornada não encontrada.");

    const adjustment = requestWorkShiftAdjustment({
      session,
      requestedByUserId: actor.userId,
      reason: input.reason,
      changes: input.changes,
    });
    return store.createAdjustment(adjustment);
  },

  async approve(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAdjustmentDbStore(db);
    const adjustment = await store.getAdjustmentById(input.adjustmentId);
    if (!adjustment) throw new Error("Ajuste de jornada não encontrado.");
    const session = await store.getSessionSnapshot(adjustment.sessionId);
    if (!session) throw new Error("Sessão de jornada não encontrada.");

    const approved = approveWorkShiftAdjustment({
      adjustment,
      currentSession: session,
      decidedByUserId: actor.userId,
    });
    return store.approveAdjustment(approved);
  },

  async reject(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAdjustmentDbStore(db);
    const adjustment = await store.getAdjustmentById(input.adjustmentId);
    if (!adjustment) throw new Error("Ajuste de jornada não encontrado.");

    const rejected = rejectWorkShiftAdjustment({
      adjustment,
      decidedByUserId: actor.userId,
      reason: input.reason,
    });
    return store.rejectAdjustment(rejected);
  },
};
