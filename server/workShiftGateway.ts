import { and, desc, eq, inArray } from "drizzle-orm";
import { workShiftSessions } from "../drizzle/workShiftSchema";

export const ACTIVE_WORK_SHIFT_STATES = ["em_jornada", "em_intervalo"] as const;

type ActiveWorkShiftSession = {
  id: number;
  userId: number;
  state: "em_jornada" | "em_intervalo";
  startedAt: Date | null;
  breakStartedAt: Date | null;
  endedAt: Date | null;
};

type WorkShiftGatewayDb = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (order: unknown) => {
          limit: (limit: number) => Promise<ActiveWorkShiftSession[]>;
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

  return rows[0] ?? null;
}
