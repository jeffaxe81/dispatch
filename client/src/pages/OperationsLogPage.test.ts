import { describe, expect, it } from "vitest";
import { getOperationAuditDetails, getOperationLabel } from "./OperationsLogPage";

describe("rótulos do Log de operações", () => {
  it("destaca a exclusão permanente com rótulo compreensível", () => {
    expect(getOperationLabel("permanent_delete")).toBe("Exclusão permanente");
  });

  it("traduz a atualização de perfil para o Log de operações", () => {
    expect(getOperationLabel("access_profile_updated")).toBe("Perfil de acesso atualizado");
  });

  it("identifica a reinicialização controlada de forma explícita", () => {
    expect(getOperationLabel("operational_data_reset")).toBe("Dados operacionais reinicializados");
  });

  it("traduz ações de workflow e execução para o histórico completo", () => {
    expect(getOperationLabel("update_versioned")).toBe("Nova versão salva");
    expect(getOperationLabel("workflow_execution.dead_letter")).toBe("Execução enviada para dead-letter");
  });

  it("traduz as transições da jornada operacional da equipe", () => {
    expect(getOperationLabel("shift_paused")).toBe("Jornada pausada");
    expect(getOperationLabel("shift_resumed")).toBe("Jornada retomada");
  });

  it("expõe o motivo e o retrato preservado de uma exclusão permanente", () => {
    const evidence = getOperationAuditDetails({ id: 1, action: "permanent_delete", resourceType: "incident", resourceId: 10, createdAt: new Date(), beforeData: { incident: { code: "OCR-1" }, assignments: [{ id: 2 }], eventCount: 3, deletionReason: "Ocorrência duplicada" }, afterData: { deleted: true } });
    expect(evidence.incidentCode).toBe("OCR-1");
    expect(evidence.deletionReason).toBe("Ocorrência duplicada");
    expect(evidence.eventCount).toBe(3);
  });

  it("preserva motivo, impacto e itens mantidos para a reinicialização controlada", () => {
    const evidence = getOperationAuditDetails({ id: 2, action: "operational_data_reset", resourceType: "solution_reset", resourceId: 0, createdAt: new Date(), beforeData: { reason: "Novo ciclo de homologação", resetScope: "total_solution_data", totalRecords: 7, impact: { occurrences: 2, workflows: 1 }, preserved: ["usuários", "auditoria"] }, afterData: { completed: true, completedAt: "2026-08-21T00:00:00.000Z" } });
    expect(evidence.reset).toEqual(expect.objectContaining({ reason: "Novo ciclo de homologação", scope: "total_solution_data", totalRecords: 7, preserved: ["usuários", "auditoria"] }));
    expect(evidence.reset?.impact).toEqual({ occurrences: 2, workflows: 1 });
  });
});
