import { eq } from "drizzle-orm";
import { teams } from "../drizzle/schema";
import { workShiftSessions } from "../drizzle/workShiftSchema";
import { getEffectiveAccess } from "./accessControl";
import { getDb } from "./db";
import { createWorkShiftAlertDbStore } from "./workShiftAlertDbStore";
import { evaluateWorkShiftAlerts } from "./workShiftAlertService";
import type { WorkShiftAlertActor, WorkShiftAlertsRouterDependencies } from "./workShiftAlertsRouter";

export type WorkShiftAlertScope = {
  organizationId: number | null;
  organizationalUnitId: number | null;
};

const DEFAULT_ALERT_POLICY = {
  notStartedGraceSeconds: 300,
  lateStartThresholdSeconds: 300,
  pauseExceededSeconds: 3600,
  shiftOverrunSeconds: 900,
  notEndedGraceSeconds: 900,
} as const;

function isWildcard(actor: WorkShiftAlertActor) {
  return actor.permissions.includes("*");
}

export function assertWorkShiftAlertScope(actor: WorkShiftAlertActor, scope: WorkShiftAlertScope) {
  if (isWildcard(actor)) return;
  if (!scope.organizationId || scope.organizationId < 1) {
    throw new Error("Escopo organizacional do alerta de jornada não pôde ser resolvido.");
  }
  if (!actor.organizationId || actor.organizationId < 1 || actor.organizationId !== scope.organizationId) {
    throw new Error("Alerta de jornada fora do escopo organizacional autorizado.");
  }
  if (
    actor.organizationalUnitId !== null &&
    (actor.organizationalUnitId < 1 || actor.organizationalUnitId !== scope.organizationalUnitId)
  ) {
    throw new Error("Alerta de jornada fora da unidade organizacional autorizada.");
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

async function resolveActor(user: Parameters<typeof getEffectiveAccess>[0]): Promise<WorkShiftAlertActor> {
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

async function loadTeam(db: any, teamId: number | null) {
  if (!teamId) return null;
  return (await db.select().from(teams).where(eq(teams.id, teamId)).limit(1))[0] ?? null;
}

function teamScope(team: any): WorkShiftAlertScope {
  return {
    organizationId: team?.organizationId ?? null,
    organizationalUnitId: team?.organizationalUnitId ?? null,
  };
}

function legacyStateDiverges(session: any, team: any) {
  if (!team) return false;
  if (session.status === "active") return !team.shiftStartedAt || Boolean(team.shiftPausedAt);
  if (session.status === "paused") return !team.shiftStartedAt || !team.shiftPausedAt;
  if (session.status === "ended" || session.status === "cancelled") return Boolean(team.shiftStartedAt || team.shiftPausedAt);
  return false;
}

async function visibleAlertScope(db: any, alert: { teamId: number | null; sessionId: number | null }) {
  if (alert.teamId) return teamScope(await loadTeam(db, alert.teamId));
  if (alert.sessionId) {
    const session = (await db.select({ teamId: workShiftSessions.teamId })
      .from(workShiftSessions)
      .where(eq(workShiftSessions.id, alert.sessionId))
      .limit(1))[0];
    return teamScope(await loadTeam(db, session?.teamId ?? null));
  }
  return { organizationId: null, organizationalUnitId: null };
}

export const workShiftAlertsRouterDependencies: WorkShiftAlertsRouterDependencies = {
  resolveActor,

  async list(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAlertDbStore(db);
    const alerts = await store.listAlerts(input);
    if (isWildcard(actor)) return alerts;

    const visible = [];
    for (const alert of alerts) {
      const scope = await visibleAlertScope(db, alert);
      try {
        assertWorkShiftAlertScope(actor, scope);
        visible.push(alert);
      } catch {
        // Fail closed: alerts sem escopo resolvível ou fora do escopo não são expostos.
      }
    }
    return visible;
  },

  async evaluate(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAlertDbStore(db);
    const session = (await db.select().from(workShiftSessions)
      .where(eq(workShiftSessions.id, input.sessionId))
      .limit(1))[0];
    if (!session) throw new Error("Sessão de jornada não encontrada.");

    const team = await loadTeam(db, session.teamId ?? null);
    assertWorkShiftAlertScope(actor, teamScope(team));

    const detected = evaluateWorkShiftAlerts({
      evaluatedAt: new Date(),
      userId: session.userId,
      teamId: session.teamId ?? null,
      sessionId: session.id,
      plannedStartAt: session.scheduledStartAt ?? null,
      plannedEndAt: session.scheduledEndAt ?? null,
      actualStartAt: session.startedAt ?? null,
      actualEndAt: session.endedAt ?? null,
      status: session.status,
      pausedSeconds: Number(session.pausedSeconds ?? 0),
      availableForDispatch: team?.status === "disponivel",
      legacyStateDivergence: legacyStateDiverges(session, team),
      coverageGap: false,
      policy: DEFAULT_ALERT_POLICY,
    });

    return store.persistDetectedAlerts(detected);
  },

  async acknowledge(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAlertDbStore(db);
    const alert = (await store.listAlerts()).find(item => item.id === input.alertId);
    if (!alert) throw new Error("Alerta de jornada não encontrado.");
    assertWorkShiftAlertScope(actor, await visibleAlertScope(db, alert));
    return store.acknowledgeAlert({ alertId: input.alertId, actorUserId: actor.userId, at: new Date() });
  },

  async resolve(input, actor) {
    const db = await requireDb();
    const store = createWorkShiftAlertDbStore(db);
    const alert = (await store.listAlerts()).find(item => item.id === input.alertId);
    if (!alert) throw new Error("Alerta de jornada não encontrado.");
    assertWorkShiftAlertScope(actor, await visibleAlertScope(db, alert));
    return store.resolveAlert({ alertId: input.alertId, actorUserId: actor.userId, at: new Date() });
  },
};
