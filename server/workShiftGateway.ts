import { and, desc, eq, inArray } from "drizzle-orm";
import { workShiftSessions } from "../drizzle/workShiftSchema";

export const ACTIVE_WORK_SHIFT_STATES = ["em_jornada", "em_intervalo"] as const;

type WorkShiftSessionRow = {
  id: number;
  userId: number;
  state: "fora_jornada" | "em_jornada" | "em_intervalo" | "encerrada";
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

type ActiveWorkShiftSession = WorkShiftSessionRow & {
  state: "em_jornada" | "em_intervalo";
};

type WorkShiftGatewayDb = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (order: unknown) => {
          limit: (limit: number) => Promise<WorkShiftSessionRow[]>;
        };
      };
    };
  };
};

export async function selectActiveWorkShiftSession(
  db: WorkShiftGatewayDb,
  userId: number,
): Promise<ActiveWorkShiftSession | null> {
  const rows = await db
    .select()
    .from(workShiftSessions)
    .where(
      and(
        eq(workShiftSessions.userId, userId),
        inArray(workShiftSessions.state, [...ACTIVE_WORK_SHIFT_STATES]),
      ),
    )
    .orderBy(desc(workShiftSessions.startedAt))
    .limit(1);

  return (rows[0] as ActiveWorkShiftSession | undefined) ?? null;
}

export async function selectWorkShiftHistory(
  db: WorkShiftGatewayDb,
  userId: number,
  limit = 10,
): Promise<WorkShiftSessionRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 31));
  return db
    .select()
    .from(workShiftSessions)
    .where(eq(workShiftSessions.userId, userId))
    .orderBy(desc(workShiftSessions.startedAt))
    .limit(safeLimit);
}
