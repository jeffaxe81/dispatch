/**
 * Priorização somente leitura do Kanban de Despacho.
 * "Idade" é tempo desde a abertura da ocorrência, nunca tempo na etapa ou SLA.
 */
export type KanbanSortOrder = "priority" | "oldest" | "newest" | "stage-oldest";
export type KanbanQueueFilters = {
  priority: "todas" | "baixa" | "media" | "alta" | "critica";
  query: string;
  sort: KanbanSortOrder;
};
type IncidentSummary = {
  id: number;
  code: string;
  category: string;
  priority: string;
  createdAt: Date | string;
  stageEnteredAt?: Date | string | null;
};
const PRIORITY_WEIGHT: Record<string, number> = { critica: 4, alta: 3, media: 2, baixa: 1 };

function timestamp(value: Date | string): number | null {
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

export function ageMinutesSinceCreation(createdAt: Date | string, now: Date): number | null {
  const created = timestamp(createdAt);
  const current = now.getTime();
  if (created === null || !Number.isFinite(current) || created > current) return null;
  return Math.floor((current - created) / 60_000);
}

export function formatIncidentAge(createdAt: Date | string, now: Date): string {
  const minutes = ageMinutesSinceCreation(createdAt, now);
  if (minutes === null) return "Abertura sem horário válido";
  if (minutes < 1) return "Aberta há menos de 1 min";
  if (minutes < 60) return "Aberta há " + minutes + " min";
  if (minutes < 1_440) return "Aberta há " + Math.floor(minutes / 60) + " h";
  return "Aberta há " + Math.floor(minutes / 1_440) + " d";
}

/**
 * F011: stage age is NEVER inferred from the incident opening timestamp.
 * Legacy rows without an audited status transition remain unknown.
 */
export function stageAgeMinutes(stageEnteredAt: Date | string | null | undefined, now: Date): number | null {
  if (!stageEnteredAt) return null;
  return ageMinutesSinceCreation(stageEnteredAt, now);
}

export function formatStageAge(stageEnteredAt: Date | string | null | undefined, now: Date): string {
  const minutes = stageAgeMinutes(stageEnteredAt, now);
  if (minutes === null) return "Tempo na etapa indisponível";
  if (minutes < 1) return "Na etapa há menos de 1 min";
  if (minutes < 60) return "Na etapa há " + minutes + " min";
  if (minutes < 1_440) return "Na etapa há " + Math.floor(minutes / 60) + " h";
  return "Na etapa há " + Math.floor(minutes / 1_440) + " d";
}

/** F012: average among visible, audited card ages only, not the full column. */
export function stageSampleAverageMinutes(rows: readonly { incident: { stageEnteredAt?: Date | string | null } }[], now: Date): { averageMinutes: number | null; observed: number; total: number } {
  const valid = rows.map(row => stageAgeMinutes(row.incident.stageEnteredAt, now)).filter((v): v is number => v !== null);
  return {
    averageMinutes: valid.length ? Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length) : null,
    observed: valid.length,
    total: rows.length,
  };
}

/**
 * Filtra e ordena apenas as linhas já autorizadas pela API.
 * Não altera registros nem tem efeito sobre permissão, status ou SLA.
 */
export function prepareKanbanRows<T extends { incident: IncidentSummary }>(
  rows: readonly T[],
  filters: KanbanQueueFilters,
): T[] {
  const query = normalized(filters.query);
  const filtered = rows.filter(({ incident }) => {
    if (filters.priority !== "todas" && incident.priority !== filters.priority) return false;
    if (!query) return true;
    return normalized(incident.code).includes(query) || normalized(incident.category).includes(query);
  });

  return [...filtered].sort((left, right) => {
    const a = left.incident;
    const b = right.incident;
    const timeA = timestamp(a.createdAt);
    const timeB = timestamp(b.createdAt);
    if (filters.sort === "stage-oldest") {
      const stageA = a.stageEnteredAt ? timestamp(a.stageEnteredAt) : null;
      const stageB = b.stageEnteredAt ? timestamp(b.stageEnteredAt) : null;
      if (stageA === null && stageB !== null) return 1;
      if (stageA !== null && stageB === null) return -1;
      if (stageA !== null && stageB !== null && stageA !== stageB) return stageA - stageB;
      return a.id - b.id;
    }
    if (filters.sort === "priority") {
      const weightDifference = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
      if (weightDifference) return weightDifference;
    }
    // Horários inválidos sempre ao final, independentemente da ordenação.
    if (timeA === null && timeB !== null) return 1;
    if (timeA !== null && timeB === null) return -1;
    if (timeA !== null && timeB !== null && timeA !== timeB) {
      return filters.sort === "newest" ? timeB - timeA : timeA - timeB;
    }
    return a.id - b.id;
  });
}
