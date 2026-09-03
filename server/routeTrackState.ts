export function buildRouteTrackPoint(input: {
  routeTrackId: number;
  teamLocationId: number;
  previousSequence: number | null;
}) {
  if (input.routeTrackId <= 0) throw new Error("Identificador do trajeto inválido.");
  if (input.teamLocationId <= 0) throw new Error("Referência de localização inválida.");
  const sequence = (input.previousSequence ?? 0) + 1;
  return {
    routeTrackId: input.routeTrackId,
    teamLocationId: input.teamLocationId,
    sequence,
  };
}

export function closeRouteTrack(input: {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
}) {
  if (input.endedAt.getTime() < input.startedAt.getTime()) {
    throw new Error("O encerramento do trajeto não pode ser anterior ao início.");
  }
  if (input.distanceMeters < 0) throw new Error("A distância do trajeto não pode ser negativa.");

  return {
    status: "completed" as const,
    endedAt: input.endedAt,
    durationSeconds: Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000),
    distanceMeters: Math.floor(input.distanceMeters),
  };
}
