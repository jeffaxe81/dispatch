import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeIncidentStatusTransition } from "./incidentTimeline";

describe("AXED-F017 — estados de movimento auditado", () => {
  it("exibe origem e destino quando há transição confirmada", () => {
    const text = describeIncidentStatusTransition({ previousStatus: "triagem", nextStatus: "aguardando_despacho" });
    expect(text).toContain("→");
    expect(text).not.toBeNull();
  });
  it("não transforma atualizações sem movimento em transição", () => {
    expect(describeIncidentStatusTransition({ previousStatus: "triagem", nextStatus: "triagem" })).toBeNull();
  });
  it("sem estado anterior ou novo não inventa movimento", () => {
    expect(describeIncidentStatusTransition({ previousStatus: null, nextStatus: "triagem" })).toBeNull();
    expect(describeIncidentStatusTransition({ previousStatus: "triagem", nextStatus: null })).toBeNull();
  });
  it("funciona para retorno operacional e encerramento", () => {
    const a = describeIncidentStatusTransition({ previousStatus: "pausada", nextStatus: "em_atendimento" });
    const b = describeIncidentStatusTransition({ previousStatus: "em_atendimento", nextStatus: "concluida" });
    expect(a).toContain("→");
    expect(b).toContain("→");
    expect(a).not.toEqual(b);
  });
  it("o detalhe usa a timeline autorizada com autor, horário e estados", () => {
    const code = fs.readFileSync(path.resolve(import.meta.dirname, "../pages/IncidentDetailPage.tsx"), "utf8");
    expect(code).toContain("trpc.incidents.timeline.useQuery");
    expect(code).toContain("describeIncidentStatusTransition(event)");
    expect(code).toContain("formatDateTime(event.createdAt)");
    expect(code).toContain("actorName ??");
    expect(code).toContain("Transição auditada de situação");
  });
});
