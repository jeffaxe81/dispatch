import { describe, expect, it } from "vitest";
import { buildIncidentDeletionAuditSnapshot, isIncidentDeletionConfirmationValid } from "./db";

describe("exclusão permanente de ocorrência", () => {
  it("exige a confirmação textual associada ao código da ocorrência", () => {
    expect(isIncidentDeletionConfirmationValid({ code: "OC-2026-001", confirmation: "EXCLUIR OC-2026-001" })).toBe(true);
    expect(isIncidentDeletionConfirmationValid({ code: "OC-2026-001", confirmation: "EXCLUIR" })).toBe(false);
  });

  it("preserva um retrato operacional suficiente para auditoria antes da remoção", () => {
    const snapshot = buildIncidentDeletionAuditSnapshot({
      incident: { id: 1, code: "OC-2026-001", status: "triagem", priority: "alta", category: "Teste", origin: "central", requesterName: null, requesterContact: null, description: "Descrição", address: "Endereço", latitude: "-27.0", longitude: "-48.0", assignedTeamId: null, assignedVehicleId: null, createdByUserId: 1, closedByUserId: null, dispatchedAt: null, acceptedAt: null, startedAt: null, completedAt: null, cancelledAt: null, closeSummary: null, createdAt: new Date(), updatedAt: new Date() },
      assignments: [],
      events: [],
      reason: "Registro inserido em duplicidade",
    });
    expect(snapshot.deletionMode).toBe("permanent");
    expect(snapshot.incident.code).toBe("OC-2026-001");
    expect(snapshot.deletionReason).toContain("duplicidade");
  });
});
