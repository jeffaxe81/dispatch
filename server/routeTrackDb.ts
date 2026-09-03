import { desc, eq } from "drizzle-orm";
import { teamLocations } from "../drizzle/schema";
import { routeTrackPoints, routeTracks } from "../drizzle/schema.cp016";
import { getDb } from "./db";
import { buildRouteTrackPoint, closeRouteTrack } from "./routeTrackState";

export async function createRouteTrack(input: {
  teamId: number;
  incidentId?: number | null;
  workSessionId?: number | null;
  startedAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [created] = await db
    .insert(routeTracks)
    .values({
      teamId: input.teamId,
      incidentId: input.incidentId ?? null,
      workSessionId: input.workSessionId ?? null,
      startedAt: input.startedAt ?? new Date(),
      status: "active",
    })
    .$returningId();
  return created.id;
}

export async function appendLocationToRouteTrack(input: {
  routeTrackId: number;
  teamLocationId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async tx => {
    const track = (await tx.select().from(routeTracks).where(eq(routeTracks.id, input.routeTrackId)).limit(1))[0];
    if (!track) throw new Error("Trajeto não encontrado.");
    if (track.status !== "active") throw new Error("Somente trajetos ativos podem receber novos pontos.");

    const location = (
      await tx.select().from(teamLocations).where(eq(teamLocations.id, input.teamLocationId)).limit(1)
    )[0];
    if (!location) throw new Error("Localização não encontrada.");
    if (location.teamId !== track.teamId) {
      throw new Error("A localização informada pertence a outra equipe.");
    }

    const previous = (
      await tx
        .select({ sequence: routeTrackPoints.sequence })
        .from(routeTrackPoints)
        .where(eq(routeTrackPoints.routeTrackId, track.id))
        .orderBy(desc(routeTrackPoints.sequence))
        .limit(1)
    )[0];

    const point = buildRouteTrackPoint({
      routeTrackId: track.id,
      teamLocationId: location.id,
      previousSequence: previous?.sequence ?? null,
    });
    await tx.insert(routeTrackPoints).values(point);
    return point;
  });
}

export async function completeRouteTrack(input: {
  routeTrackId: number;
  endedAt?: Date;
  distanceMeters: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async tx => {
    const track = (await tx.select().from(routeTracks).where(eq(routeTracks.id, input.routeTrackId)).limit(1))[0];
    if (!track) throw new Error("Trajeto não encontrado.");
    if (track.status !== "active") throw new Error("O trajeto já foi encerrado.");

    const patch = closeRouteTrack({
      startedAt: track.startedAt,
      endedAt: input.endedAt ?? new Date(),
      distanceMeters: input.distanceMeters,
    });
    await tx.update(routeTracks).set(patch).where(eq(routeTracks.id, track.id));
    return { id: track.id, ...patch };
  });
}
