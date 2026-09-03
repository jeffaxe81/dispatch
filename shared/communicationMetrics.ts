export type CommunicationSessionSummary = {
  correlationId: string;
  channel: "nao_informado" | "voz" | "chat" | "whatsapp" | "email" | "video" | "outro";
  status: "iniciada" | "disponivel" | "falhou" | "encerrada";
  durationSeconds: number | null;
};

export type FilterableCommunicationSessionSummary = CommunicationSessionSummary & {
  startedAt: Date | null;
};

export type CommunicationSessionFilters = {
  startDate?: Date;
  endDate?: Date;
  channel?: CommunicationSessionSummary["channel"];
  status?: CommunicationSessionSummary["status"];
};

export function summarizeCommunicationSessions(sessions: readonly CommunicationSessionSummary[]) {
  const byChannel: Record<CommunicationSessionSummary["channel"], number> = {
    nao_informado: 0,
    voz: 0,
    chat: 0,
    whatsapp: 0,
    email: 0,
    video: 0,
    outro: 0,
  };

  let totalDurationSeconds = 0;
  let completedSessions = 0;
  let failedSessions = 0;
  let activeSessions = 0;

  for (const session of sessions) {
    byChannel[session.channel] += 1;
    if (session.durationSeconds !== null) totalDurationSeconds += Math.max(0, session.durationSeconds);
    if (session.status === "encerrada") completedSessions += 1;
    else if (session.status === "falhou") failedSessions += 1;
    else activeSessions += 1;
  }

  return {
    totalSessions: sessions.length,
    completedSessions,
    failedSessions,
    activeSessions,
    totalDurationSeconds,
    averageDurationSeconds: completedSessions > 0 ? Math.round(totalDurationSeconds / completedSessions) : 0,
    byChannel,
  };
}

export function summarizeFilteredCommunicationSessions(
  sessions: readonly FilterableCommunicationSessionSummary[],
  filters: CommunicationSessionFilters,
) {
  const filtered = sessions.filter(session => {
    if (filters.channel && session.channel !== filters.channel) return false;
    if (filters.status && session.status !== filters.status) return false;
    if (filters.startDate && (!session.startedAt || session.startedAt < filters.startDate)) return false;
    if (filters.endDate && (!session.startedAt || session.startedAt > filters.endDate)) return false;
    return true;
  });

  return summarizeCommunicationSessions(filtered);
}
