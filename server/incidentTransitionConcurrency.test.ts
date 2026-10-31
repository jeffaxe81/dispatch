import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertCurrentIncidentTransition } from "./incidentTransitionConcurrency";

describe("AXED-F020 — primeira barreira contra transição concorrente", () => {
  it("admite uma transição válida quando o estado informado corresponde ao banco", () => {
    expect(() => assertCurrentIncidentTransition("triagem", "aguardando_despacho", "triagem")).not.toThrow();
  });
  it("rejeita evento stale, mesmo que o novo estado pareça válido no cliente", () => {
    expect(() => assertCurrentIncidentTransition("despachada", "aguardando_despacho", "triagem"))
      .toThrow(/Recarregue a fila/);
  });
  it("retorna erro de conflito, não de falha técnica, para cliente desatualizado", () => {
    try {
      assertCurrentIncidentTransition("em_atendimento", "pausada", "aceita");
      throw new Error("guard não disparou");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("CONFLICT");
    }
  });
  it("não aceita transição proibida no estado efetivo mesmo sem versão do cliente legado", () => {
    expect(() => assertCurrentIncidentTransition("concluida", "triagem")).toThrow(/não permite/);
    expect(() => assertCurrentIncidentTransition("concluida", "concluida", "concluida")).toThrow(/não permite/);
  });
  it("revalida status sob bloqueio do banco antes de gravar evento e auditoria", () => {
    const db = fs.readFileSync(path.resolve(import.meta.dirname, "dbLegacy.ts"), "utf8");
    const fragment = db.slice(db.indexOf("export async function transitionIncident("), db.indexOf("export async function assignTeamToIncident("));
    const lock = fragment.indexOf('.for("update")');
    const validate = fragment.indexOf("assertCurrentIncidentTransition(");
    const update = fragment.indexOf("tx.update(incidents)");
    const audit = fragment.indexOf("tx.insert(auditLogs)");
    expect(lock).toBeGreaterThan(-1);
    expect(validate).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(validate);
    expect(audit).toBeGreaterThan(update);
  });
  it("Kanban e detalhe enviam status esperado e ambas as rotas aceitam contrato retrocompatível", () => {
    const kanban = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/KanbanPage.tsx"), "utf8");
    const detail = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/IncidentDetailPage.tsx"), "utf8");
    expect(kanban).toContain("expectedStatus: incident.status");
    expect(detail).toContain("expectedStatus: incident.status");
    for (const name of ["routers.ts", "tenantAwareAppRouter.ts"]) {
      const router = fs.readFileSync(path.resolve(import.meta.dirname, name), "utf8");
      expect(router).toContain("expectedStatus: statusEnum.optional()");
    }
  });
});
