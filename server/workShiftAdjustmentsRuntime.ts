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

export type WorkShiftAdjustmentScope = {
  organizationId: number | null;
  organizationalUnitId: number | null;
};

function isWildcard(actor: WorkShiftAdjustmentActor) {
  return actor.permissions.includes("*");
}

export function assertWorkShiftAdjustmentScope(
  actor: WorkShiftAdjustmentActor,
  scope: WorkShiftAdjustmentScope,
) {
  if (isWildcard(actor)) return;
  if (!scope.organizationId || scope.organizationId < 1) {
    throw new Error("Escopo organizacional da jornada não pôde ser resolvido.");
  }
  if (!actor.organizationId || actor.organizationId < 1 || actor.organizationId !== scope.organizationId) {
    throw new Error("Jornada fora do escopo organizacional autorizado.");
  }
  if (
    actor.organizationalUnitId !== null &&
    (actor.organizationalUnitId < 1 || actor.organizationalUnitId !== scope.organizationalUnitId)
  ) {
    throw new Error("Jornada fora da unidade organizacional autorizada.");
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function resolveActor(user: Parameters<typeof getEffectiveAccess>[0]): Promise<WorkShiftAdjustmentActor> {
  const access = await getEffectiveAccess(user);
  const legacyAdministrator = !access.usesDynamicRoles && user.operationalRole === "administrador";
  const globalAssignment = access.assignments.some(assignment => assignment.defaultScope === "global");

  if (access.isSuperAdministrator || legacyAdministrator || globalAssignment) {
    return { userId: user.id, organizationId: null, organizationalUnitId: null, permissions: ["*"] };
  }

  const organizationIds = Array.from(new Set(access.assignments
    .map(assignment => assignment.organizationId)
    .filter((value): value is number => value !== null)));
  const organizationId = organizationIds.length === 1 ? organizationIds[0] : -1;
  const organizationWide = organizationId > 0 && access.assignments.some(
    assignment => assignment.organizationId === organizationId && assignment.defaultScope === "organizacao",
  );
  const unitIds = Array.from(new Set(access.assignments
    .filter(assignment => assignment.organizationId === organizationId)
    .map(assignment => assignment.organizationalUnitId)
    .filter((value): value is number => value !== null)));
  const organizationalUnitId = organizationWide ? null : unitIds.length === 1 ? unitIds[0] : -1;

  return {
    userId: user.id,
    organizationId,
    organizationalUnitId,
    permissions: access.permissions,
  };
}

export const workShiftAdjustmentsRouterDependencies: WorkShiftAdjustmentsRouterDependencies = {
  resolveActor,

  async list(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAdjustmentDbStore(db);
    const adjustments = await store.listAdjustments(input);
    if (isWildcard(actor)) return adjustments;

    const visible = [];
    for (const adjustment of adjustments) {
      const scope = await store.getSessionScope(adjustment.sessionId);
      try {
        assertWorkShiftAdjustmentScope(actor, scope);
        visible.push(adjustment);
      } catch {
        // Fail closed: records outside or without resolvable scope are not exposed.
      }
    }
    return visible;
  },

  async request(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAdjustmentDbStore(db);
    const scope = await store.getSessionScope(input.sessionId);
    assertWorkShiftAdjustmentScope(actor, scope);
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
    const scope = await store.getSessionScope(adjustment.sessionId);
    assertWorkShiftAdjustmentScope(actor, scope);
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
    const scope = await store.getSessionScope(adjustment.sessionId);
    assertWorkShiftAdjustmentScope(actor, scope);

    const rejected = rejectWorkShiftAdjustment({
      adjustment,
      decidedByUserId: actor.userId,
      reason: input.reason,
    });
    return store.rejectAdjustment(rejected);
  },
};
