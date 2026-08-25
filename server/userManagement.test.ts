import { describe, expect, it } from "vitest";
import { createManualUserOpenId, requiresTeamForOperationalRole, resolveAgentOperationalReconciliation, shouldLinkPreprovisionedUser } from "./db";

describe("pré-cadastro manual de usuário", () => {
  it("gera identificadores internos distintos e não reutilizáveis como nome de exibição", () => {
    const first = createManualUserOpenId();
    const second = createManualUserOpenId();
    expect(first).toMatch(/^manual:[A-Za-z0-9_-]{21}$/);
    expect(second).toMatch(/^manual:[A-Za-z0-9_-]{21}$/);
    expect(first).not.toBe(second);
  });

  it("vincula o pré-cadastro apenas no primeiro login com e-mail corporativo correspondente", () => {
    expect(shouldLinkPreprovisionedUser({ hasExistingOpenId: false, hasCorporateEmail: true, hasPreprovisionedEmail: true })).toBe(true);
    expect(shouldLinkPreprovisionedUser({ hasExistingOpenId: true, hasCorporateEmail: true, hasPreprovisionedEmail: true })).toBe(false);
    expect(shouldLinkPreprovisionedUser({ hasExistingOpenId: false, hasCorporateEmail: false, hasPreprovisionedEmail: true })).toBe(false);
  });

  it("exige equipe apenas para a função operacional de agente de campo", () => {
    expect(requiresTeamForOperationalRole("agente")).toBe(true);
    expect(requiresTeamForOperationalRole("operador")).toBe(false);
  });

  it("reconcilia perfil dinâmico Agente de Campo quando a sessão ainda informa Operador", () => {
    expect(resolveAgentOperationalReconciliation({ operationalRole: "operador", role: "user", teamId: null }, 7)).toEqual({ operationalRole: "agente", role: "user", teamId: 7 });
    expect(resolveAgentOperationalReconciliation({ operationalRole: "agente", role: "user", teamId: 7 }, 7)).toBeNull();
  });
});
