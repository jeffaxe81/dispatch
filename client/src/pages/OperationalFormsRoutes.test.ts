// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveActiveAgentIncidentId } from "./OperationalFormsRoutes";

describe("D-008 operational route integration", () => {
  it("seleciona somente ocorrência em atendimento ativo do agente", () => {
    expect(resolveActiveAgentIncidentId([
      { incident: { id: 10, status: "despachada" } },
      { incident: { id: 11, status: "aceita" } },
      { incident: { id: 12, status: "concluida" } },
    ])).toBe(11);
  });

  it("não abre formulários quando não existe atendimento ativo", () => {
    expect(resolveActiveAgentIncidentId([{ incident: { id: 10, status: "despachada" } }, { incident: { id: 12, status: "concluida" } }])).toBeNull();
  });
});
