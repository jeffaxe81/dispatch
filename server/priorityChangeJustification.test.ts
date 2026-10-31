import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { requirePriorityChangeJustification } from "./priorityChangeJustification";

describe("AXED-F016 — justificativa obrigatória ao alterar prioridade", () => {
  it("rejeita mudança sem justificativa e não permite motivo vazio", () => {
    expect(() => requirePriorityChangeJustification("baixa", "critica")).toThrow();
    expect(() => requirePriorityChangeJustification("media", "alta", "   ")).toThrow();
  });
  it("rejeita justificativa curta ou muito longa", () => {
    expect(() => requirePriorityChangeJustification("baixa", "alta", "abcd")).toThrow();
    expect(() => requirePriorityChangeJustification("baixa", "alta", "x".repeat(501))).toThrow();
  });
  it("aceita justificativa válida e remove espaços externos", () => {
    expect(requirePriorityChangeJustification("media", "alta", "  Risco de queda  ")).toBe("Risco de queda");
  });
  it("não exige justificativa em edição sem mudança de prioridade", () => {
    expect(requirePriorityChangeJustification("media", undefined, undefined)).toBeNull();
    expect(requirePriorityChangeJustification("alta", "alta", undefined)).toBeNull();
  });
  it("no banco exige a justificativa antes do update e a preserva na auditoria", () => {
    const code = fs.readFileSync(path.resolve(import.meta.dirname, "dbLegacy.ts"), "utf8");
    const section = code.slice(code.indexOf("export async function updateIncident(input:"), code.indexOf("export function isIncidentDeletionConfirmationValid"));
    expect(section.indexOf("requirePriorityChangeJustification(")).toBeLessThan(section.indexOf("tx.update(incidents)"));
    expect(section).toContain("priorityChangeReason ? { ...snapshotIncident(after), priorityChangeReason }");
    expect(section).toContain("priorityChangeReason ? \"Prioridade alterada");
  });
  it("o contrato é idêntico em ambos os routers e a tela exige motivo", () => {
    for (const p of ["routers.ts", "tenantAwareAppRouter.ts"]) {
      const code = fs.readFileSync(path.resolve(import.meta.dirname, p), "utf8");
      const start = code.indexOf("  incidents: router({");
      const update = code.slice(code.indexOf("    update: operationalProcedure", start), code.indexOf("    permanentlyDelete:", start));
      expect(update).toContain("priorityChangeReason: z.string().trim().max(500).optional()");
    }
    const page = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/IncidentDetailPage.tsx"), "utf8");
    expect(page).toContain("Justificativa da mudança de prioridade");
    expect(page).toContain("priorityChangeReason.trim().length < 5");
  });
});
