import { and, eq } from "drizzle-orm";
import { workShiftSchedules } from "../drizzle/workShiftSchema";
import { getEffectiveAccess } from "./accessControl";
import { getDb } from "./db";
import { loadWorkShiftCoverageData } from "./workShiftCoverageDb";
import { listWorkShiftCoverage } from "./workShiftCoverageService";
import { createWorkShiftScheduleDbStore } from "./workShiftScheduleDbStore";
import { createWorkShiftScheduleService, type WorkShiftScheduleActor } from "./workShiftScheduleService";
import type { WorkShiftSchedulesRouterDependencies } from "./workShiftSchedulesRouter";

function isWildcard(actor: WorkShiftScheduleActor) {
  return actor.permissions.includes("*");
}

function assertActorScope(actor: WorkShiftScheduleActor, organizationId: number, organizationalUnitId: number | null) {
  if (isWildcard(actor)) return;
  if (!actor.organizationId || actor.organizationId < 1 || actor.organizationId !== organizationId) {
    throw new Error("Escala fora do escopo organizacional autorizado.");
  }
  if (actor.organizationalUnitId !== null && actor.organizationalUnitId !== organizationalUnitId) {
    throw new Error("Escala fora da unidade organizacional autorizada.");
  }
}

async function requireScheduleDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function resolveActor(user: Parameters<typeof getEffectiveAccess>[0]): Promise<WorkShiftScheduleActor> {
  const access = await getEffectiveAccess(user);
  const legacyAdministrator = !access.usesDynamicRoles && user.operationalRole === "administrador";
  const globalAssignment = access.assignments.some(assignment => assignment.defaultScope === "global");

  if (access.isSuperAdministrator || legacyAdministrator || globalAssignment) {
    return { userId: user.id, organizationId: null, organizationalUnitId: null, permissions: ["*"] };
  }

  const organizationIds = Array.from(new Set(access.assignments.map(assignment => assignment.organizationId).filter((value): value is number => value !== null)));
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

export const workShiftSchedulesRouterDependencies: WorkShiftSchedulesRouterDependencies = {
  resolveActor,

  async listSchedules(input, actor) {
    const db = await requireScheduleDb();
    const requestedOrganizationId = input.organizationId ?? actor.organizationId;
    if (!requestedOrganizationId || requestedOrganizationId < 1) {
      if (!isWildcard(actor)) throw new Error("Selecione uma organização dentro do escopo autorizado.");
      return db.select().from(workShiftSchedules).where(eq(workShiftSchedules.active, true)).orderBy(workShiftSchedules.code);
    }

    const requestedUnitId = input.organizationalUnitId ?? null;
    assertActorScope(actor, requestedOrganizationId, requestedUnitId);
    const where = requestedUnitId === null
      ? and(eq(workShiftSchedules.active, true), eq(workShiftSchedules.organizationId, requestedOrganizationId))
      : and(
          eq(workShiftSchedules.active, true),
          eq(workShiftSchedules.organizationId, requestedOrganizationId),
          eq(workShiftSchedules.organizationalUnitId, requestedUnitId),
        );
    return db.select().from(workShiftSchedules).where(where).orderBy(workShiftSchedules.code);
  },

  async createSchedule(input, actor) {
    assertActorScope(actor, input.organizationId, input.organizationalUnitId);
    if (input.effectiveUntil && input.effectiveFrom >= input.effectiveUntil) {
      throw new Error("effectiveFrom deve ser anterior a effectiveUntil");
    }
    if (input.scheduleType === "cyclic_12x36") {
      if (!input.cycleAnchorAt) throw new Error("cycleAnchorAt é obrigatório para escala 12x36.");
      if (input.plannedDurationMinutes !== 720 || input.cycleWorkMinutes !== 720 || input.cycleRestMinutes !== 2160) {
        throw new Error("Escala 12x36 deve usar 720 minutos de trabalho e 2160 minutos de descanso.");
      }
    }
    if (input.scheduleType === "fixed" && (!input.weekdays || input.weekdays.length === 0)) {
      throw new Error("Escala fixa deve informar ao menos um dia da semana.");
    }

    const db = await requireScheduleDb();
    const [createdId] = await db.insert(workShiftSchedules).values({ ...input, active: true }).$returningId();
    if (!createdId) throw new Error("Falha ao persistir escala de jornada.");
    const created = (await db.select().from(workShiftSchedules).where(eq(workShiftSchedules.id, createdId.id)).limit(1))[0];
    if (!created) throw new Error("Escala persistida não encontrada.");
    return created;
  },

  async assignSchedule(input, actor) {
    const db = await requireScheduleDb();
    return createWorkShiftScheduleService(createWorkShiftScheduleDbStore(db)).createAssignment(input, actor);
  },

  async addException(input, actor) {
    const db = await requireScheduleDb();
    return createWorkShiftScheduleService(createWorkShiftScheduleDbStore(db)).createException(input, actor);
  },

  async resolveForUser(input, actor) {
    const db = await requireScheduleDb();
    const store = createWorkShiftScheduleDbStore(db);
    const resolved = await createWorkShiftScheduleService(store).resolveForUser(input.userId, input.instant);
    if (!resolved) return null;
    const schedule = await store.findScheduleById(resolved.scheduleId);
    if (!schedule) return null;
    assertActorScope(actor, schedule.organizationId, schedule.organizationalUnitId);
    return resolved;
  },

  async coverage(input, actor) {
    if (input.from >= input.until) throw new Error("from deve ser anterior a until.");
    if (!isWildcard(actor) && (!actor.organizationId || actor.organizationId < 1 || actor.organizationalUnitId === -1)) {
      throw new Error("Escopo organizacional ambíguo para consulta de cobertura.");
    }

    const requestedOrganizationId = input.organizationId ?? actor.organizationId ?? undefined;
    const requestedUnitId = input.organizationalUnitId ?? (
      actor.organizationalUnitId !== null && actor.organizationalUnitId > 0
        ? actor.organizationalUnitId
        : undefined
    );

    if (!isWildcard(actor)) {
      if (!requestedOrganizationId) throw new Error("Escopo organizacional obrigatório para consulta de cobertura.");
      assertActorScope(actor, requestedOrganizationId, requestedUnitId ?? null);
    } else if (requestedOrganizationId && requestedUnitId !== undefined) {
      assertActorScope(actor, requestedOrganizationId, requestedUnitId);
    }

    const db = await requireScheduleDb();
    const data = await loadWorkShiftCoverageData(db, {
      from: input.from,
      until: input.until,
      ...(requestedOrganizationId === undefined ? {} : { organizationId: requestedOrganizationId }),
      ...(requestedUnitId === undefined ? {} : { organizationalUnitId: requestedUnitId }),
      ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
    });

    for (const assignment of data.assignments) {
      assertActorScope(actor, assignment.schedule.organizationId, assignment.schedule.organizationalUnitId);
    }

    return listWorkShiftCoverage({
      from: input.from,
      until: input.until,
      assignments: data.assignments,
      exceptions: data.exceptions,
      sessions: data.sessions,
    });
  },
};