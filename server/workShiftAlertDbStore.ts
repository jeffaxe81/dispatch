import { and, desc, eq, inArray } from "drizzle-orm";
import { workShiftAlerts } from "../drizzle/workShiftAlertSchema";
import type { WorkShiftAlertSnapshot } from "../shared/workShiftAlerts";

export type WorkShiftAlertDbExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction?: <T>(callback: (tx: WorkShiftAlertDbExecutor) => Promise<T>) => Promise<T>;
};

type PersistedWorkShiftAlert = WorkShiftAlertSnapshot & { id: number };

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function hydrate(row: any): PersistedWorkShiftAlert {
  return {
    id: Number(row.id),
    type: row.type,
    severity: row.severity,
    status: row.status,
    dedupeKey: row.dedupeKey,
    userId: row.userId === null ? null : Number(row.userId),
    teamId: row.teamId === null ? null : Number(row.teamId),
    sessionId: row.sessionId === null ? null : Number(row.sessionId),
    detectedAt: asDate(row.detectedAt)!,
    acknowledgedAt: asDate(row.acknowledgedAt),
    acknowledgedByUserId: row.acknowledgedByUserId === null ? null : Number(row.acknowledgedByUserId),
    resolvedAt: asDate(row.resolvedAt),
    resolvedByUserId: row.resolvedByUserId === null ? null : Number(row.resolvedByUserId),
    metadata: row.metadata ?? {},
  };
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function createWorkShiftAlertDbStore(db: WorkShiftAlertDbExecutor) {
  async function inTransaction<T>(callback: (tx: WorkShiftAlertDbExecutor) => Promise<T>) {
    return db.transaction ? db.transaction(callback) : callback(db);
  }

  async function loadForUpdate(tx: WorkShiftAlertDbExecutor, alertId: number) {
    const query: any = tx
      .select()
      .from(workShiftAlerts)
      .where(eq(workShiftAlerts.id, alertId))
      .limit(1);
    const rows = await (typeof query.for === "function" ? query.for("update") : query);
    return rows[0] ? hydrate(rows[0]) : null;
  }

  return {
    async persistDetectedAlerts(detected: WorkShiftAlertSnapshot[]): Promise<PersistedWorkShiftAlert[]> {
      if (detected.length === 0) return [];
      return inTransaction(async tx => {
        const inserted: PersistedWorkShiftAlert[] = [];
        for (const candidate of detected) {
          const query: any = tx
            .select({ id: workShiftAlerts.id })
            .from(workShiftAlerts)
            .where(and(
              eq(workShiftAlerts.dedupeKey, candidate.dedupeKey),
              inArray(workShiftAlerts.status, ["open", "acknowledged"]),
            ))
            .limit(1);
          const existing = await (typeof query.for === "function" ? query.for("update") : query);
          if (existing.length > 0) continue;

          const [created] = await tx.insert(workShiftAlerts).values({
            type: candidate.type,
            severity: candidate.severity,
            status: "open",
            dedupeKey: candidate.dedupeKey,
            userId: candidate.userId,
            teamId: candidate.teamId,
            sessionId: candidate.sessionId,
            detectedAt: candidate.detectedAt,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            resolvedAt: null,
            resolvedByUserId: null,
            metadata: jsonSafe(candidate.metadata),
          }).$returningId();
          if (!created) throw new Error("Falha ao persistir alerta de jornada.");
          inserted.push({ ...candidate, id: Number(created.id) });
        }
        return inserted;
      });
    },

    async listAlerts(input: {
      status?: "open" | "acknowledged" | "resolved";
      userId?: number;
      teamId?: number;
      sessionId?: number;
    } = {}): Promise<PersistedWorkShiftAlert[]> {
      const conditions = [];
      if (input.status !== undefined) conditions.push(eq(workShiftAlerts.status, input.status));
      if (input.userId !== undefined) conditions.push(eq(workShiftAlerts.userId, input.userId));
      if (input.teamId !== undefined) conditions.push(eq(workShiftAlerts.teamId, input.teamId));
      if (input.sessionId !== undefined) conditions.push(eq(workShiftAlerts.sessionId, input.sessionId));
      const query: any = db.select().from(workShiftAlerts);
      const rows = await (conditions.length ? query.where(and(...conditions)) : query)
        .orderBy(desc(workShiftAlerts.detectedAt), desc(workShiftAlerts.id));
      return rows.map(hydrate);
    },

    async acknowledgeAlert(input: { alertId: number; actorUserId: number; at: Date }): Promise<PersistedWorkShiftAlert> {
      return inTransaction(async tx => {
        const current = await loadForUpdate(tx, input.alertId);
        if (!current) throw new Error("Alerta de jornada não encontrado.");
        if (current.status === "resolved" || current.status === "acknowledged") return current;
        await tx.update(workShiftAlerts).set({
          status: "acknowledged",
          acknowledgedAt: input.at,
          acknowledgedByUserId: input.actorUserId,
        }).where(eq(workShiftAlerts.id, input.alertId));
        return {
          ...current,
          status: "acknowledged",
          acknowledgedAt: input.at,
          acknowledgedByUserId: input.actorUserId,
        };
      });
    },

    async resolveAlert(input: { alertId: number; actorUserId: number; at: Date }): Promise<PersistedWorkShiftAlert> {
      return inTransaction(async tx => {
        const current = await loadForUpdate(tx, input.alertId);
        if (!current) throw new Error("Alerta de jornada não encontrado.");
        if (current.status === "resolved") return current;
        await tx.update(workShiftAlerts).set({
          status: "resolved",
          resolvedAt: input.at,
          resolvedByUserId: input.actorUserId,
        }).where(eq(workShiftAlerts.id, input.alertId));
        return {
          ...current,
          status: "resolved",
          resolvedAt: input.at,
          resolvedByUserId: input.actorUserId,
        };
      });
    },
  };
}
