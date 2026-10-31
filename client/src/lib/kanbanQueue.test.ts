import { describe, expect, it } from "vitest";
import { ageMinutesSinceCreation, formatIncidentAge, formatStageAge, stageAgeMinutes, stageSampleAverageMinutes, prepareKanbanRows, type KanbanQueueFilters } from "./kanbanQueue";

const filters: KanbanQueueFilters = { priority: "todas", query: "", sort: "priority" };
const rows = [
  { incident: { id: 1, code: "OCO-001", category: "Alagamento", priority: "media", createdAt: "2026-10-30T08:00:00Z" } },
  { incident: { id: 2, code: "OCO-002", category: "Queda de árvore", priority: "critica", createdAt: "2026-10-30T12:00:00Z" } },
  { incident: { id: 3, code: "OCO-003", category: "Bloqueio viário", priority: "alta", createdAt: "2026-10-30T10:00:00Z" } },
  { incident: { id: 4, code: "OCO-004", category: "Apoio", priority: "critica", createdAt: "2026-10-30T07:00:00Z" } },
];
describe("Mês 2: fila Kanban - filtro, prioridade e tempo de abertura", () => {
  it("ordena criticidade primeiro e, em empate, a ocorrência mais antiga", () => {
    const result = prepareKanbanRows(rows, filters);
    expect(result.map(({ incident }) => incident.id)).toEqual([4, 2, 3, 1]);
    expect(rows.map(({ incident }) => incident.id)).toEqual([1, 2, 3, 4]);
  });

  it("filtra prioridade sem alterar a coleção original ou sua ordem", () => {
    expect(prepareKanbanRows(rows, { ...filters, priority: "critica" }).map(v => v.incident.id)).toEqual([4, 2]);
    expect(prepareKanbanRows(rows, { ...filters, priority: "baixa" })).toEqual([]);
    expect(rows).toHaveLength(4);
  });

  it("localiza código ou categoria e ignora acentos e caixa", () => {
    expect(prepareKanbanRows(rows, { ...filters, query: "arvore" }).map(v => v.incident.id)).toEqual([2]);
    expect(prepareKanbanRows(rows, { ...filters, query: "OCO-003" }).map(v => v.incident.id)).toEqual([3]);
    expect(prepareKanbanRows(rows, { ...filters, query: "  BLOQUEIO  " }).map(v => v.incident.id)).toEqual([3]);
  });

  it("permite compor filtro de prioridade e busca", () => {
    expect(prepareKanbanRows(rows, { ...filters, priority: "critica", query: "OCO-004" }).map(v => v.incident.id)).toEqual([4]);
    expect(prepareKanbanRows(rows, { ...filters, priority: "media", query: "OCO-004" })).toEqual([]);
  });

  it("ordena por abertura mais antiga e mais recente", () => {
    expect(prepareKanbanRows(rows, { ...filters, sort: "oldest" }).map(v => v.incident.id)).toEqual([4, 1, 3, 2]);
    expect(prepareKanbanRows(rows, { ...filters, sort: "newest" }).map(v => v.incident.id)).toEqual([2, 3, 1, 4]);
  });

  it("põe registros com horário inválido no final mesmo em ordenação recente", () => {
    const corrupted = [...rows, { incident: { id: 8, code: "OCO-008", category: "Análise", priority: "alta", createdAt: "invalid" } }];
    expect(prepareKanbanRows(corrupted, { ...filters, sort: "newest" }).at(-1)?.incident.id).toBe(8);
    expect(prepareKanbanRows(corrupted, { ...filters, sort: "oldest" }).at(-1)?.incident.id).toBe(8);
  });

  it("não afirma SLA nem tempo da etapa: mostra apenas idade desde abertura", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(ageMinutesSinceCreation("2026-10-31T11:01:00Z", now)).toBe(59);
    expect(formatIncidentAge("2026-10-31T11:01:00Z", now)).toBe("Aberta há 59 min");
    expect(formatIncidentAge("2026-10-31T10:01:00Z", now)).toBe("Aberta há 1 h");
    expect(formatIncidentAge("2026-10-30T11:59:00Z", now)).toBe("Aberta há 1 d");
    expect(formatIncidentAge("2026-10-31T11:59:59Z", now)).toBe("Aberta há menos de 1 min");
  });

  it("não exibe idade incorreta em caso de data futura ou relógio inválido", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(ageMinutesSinceCreation("2026-11-01T12:00:00Z", now)).toBeNull();
    expect(ageMinutesSinceCreation("invalid", now)).toBeNull();
    expect(formatIncidentAge("2026-11-01T12:00:00Z", now)).toBe("Abertura sem horário válido");
  });

  it("mantém desempate determinístico por id", () => {
    const identical = [
      { incident: { id: 9, code: "AA", category: "A", priority: "alta", createdAt: "2026-10-31T11:00:00Z" } },
      { incident: { id: 2, code: "BB", category: "B", priority: "alta", createdAt: "2026-10-31T11:00:00Z" } },
    ];
    expect(prepareKanbanRows(identical, filters).map(x => x.incident.id)).toEqual([2, 9]);
  });
});


describe("AXED-F011/F012/F015: estágio baseado em eventos e amostra de gargalo", () => {
  const now = new Date("2026-10-31T18:00:00.000Z");
  const withStages = [
    { incident: { id: 11, code: "A", category: "A", priority: "baixa", createdAt: "2026-10-29T00:00:00Z", stageEnteredAt: "2026-10-31T15:00:00Z" } },
    { incident: { id: 12, code: "B", category: "B", priority: "alta", createdAt: "2026-10-28T00:00:00Z", stageEnteredAt: "2026-10-31T17:30:00Z" } },
    { incident: { id: 13, code: "C", category: "C", priority: "critica", createdAt: "2026-10-27T00:00:00Z", stageEnteredAt: null } },
  ];
  it("mostra permanência na etapa, distinta do tempo de abertura", () => {
    expect(stageAgeMinutes(withStages[0].incident.stageEnteredAt, now)).toBe(180);
    expect(formatStageAge(withStages[0].incident.stageEnteredAt, now)).toBe("Na etapa há 3 h");
    expect(formatIncidentAge(withStages[0].incident.createdAt, now)).not.toEqual("Na etapa há 3 h");
  });
  it("sem evento auditado não inventa idade da etapa usando abertura", () => {
    expect(stageAgeMinutes(null, now)).toBeNull();
    expect(formatStageAge(null, now)).toBe("Tempo na etapa indisponível");
    expect(formatStageAge("invalid", now)).toBe("Tempo na etapa indisponível");
    expect(stageAgeMinutes("2026-11-01T00:00:00Z", now)).toBeNull();
  });
  it("ordena maior permanência primeiro dentro da página e deixa desconhecidos ao fim", () => {
    const ordered = prepareKanbanRows(withStages, { ...filters, sort: "stage-oldest" });
    expect(ordered.map(row => row.incident.id)).toEqual([11, 12, 13]);
    expect(withStages.map(row => row.incident.id)).toEqual([11, 12, 13]);
  });
  it("não mistura criticidade com permanência no estágio", () => {
    const unordered = [withStages[2], withStages[1], withStages[0]];
    expect(prepareKanbanRows(unordered, { ...filters, sort: "stage-oldest" }).map(row => row.incident.id)).toEqual([11, 12, 13]);
    expect(prepareKanbanRows(unordered, { ...filters, sort: "priority" }).map(row => row.incident.id)).toEqual([13, 12, 11]);
  });
  it("calcula média apenas de eventos válidos da amostra e relata cobertura", () => {
    expect(stageSampleAverageMinutes(withStages, now)).toEqual({ averageMinutes: 105, observed: 2, total: 3 });
    expect(stageSampleAverageMinutes([{ incident: { stageEnteredAt: null } }], now)).toEqual({ averageMinutes: null, observed: 0, total: 1 });
  });
  it("preserva desempate estável sem eventos de etapa e não altera fonte original", () => {
    const empty = [
      { incident: { id: 3, code: "C", category: "C", priority: "alta", createdAt: "2026-10-30", stageEnteredAt: null } },
      { incident: { id: 1, code: "A", category: "A", priority: "alta", createdAt: "2026-10-30", stageEnteredAt: null } },
    ];
    expect(prepareKanbanRows(empty, { ...filters, sort: "stage-oldest" }).map(row => row.incident.id)).toEqual([1, 3]);
    expect(empty.map(row => row.incident.id)).toEqual([3, 1]);
  });
});
