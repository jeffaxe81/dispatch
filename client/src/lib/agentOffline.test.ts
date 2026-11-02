import { describe, expect, it } from "vitest";
import {
  agentOfflineKey, AGENT_OFFLINE_TTL_MS, loadLastAuthorizedAssignments,
  saveLastAuthorizedAssignments, saveAgentNoteDraft, loadAgentNoteDraft,
  deleteAgentNoteDraft,
} from "./agentOffline";
const scope = { userId: 9, organizationId: 2, teamId: 3 };
function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    raw: store,
  };
}
const rows = [{ id: 15, code: "OCO-15", category: "Atendimento", status: "aceita", address: "NÃO PERSISTIR", description: "SEGREDO" }];
describe("AXED-F041/F042/F045/F046 — campo offline contido e sem replay", () => {
  it("salva somente quatro campos da lista autorizada, sem endereço/descrição", () => {
    const s = memory();
    saveLastAuthorizedAssignments(s, scope, rows, 1000);
    const raw = JSON.stringify([...s.raw.values()]);
    expect(raw).not.toContain("NÃO PERSISTIR");
    expect(raw).not.toContain("SEGREDO");
    expect(loadLastAuthorizedAssignments(s, scope, 1200)).toEqual([{ id: 15, code: "OCO-15", category: "Atendimento", status: "aceita" }]);
  });
  it("isola usuário, organização e equipe por chave e por envelope", () => {
    const s = memory();
    saveLastAuthorizedAssignments(s, scope, rows, 1000);
    expect(loadLastAuthorizedAssignments(s, { ...scope, organizationId: 4 }, 1001)).toEqual([]);
    expect(loadLastAuthorizedAssignments(s, { ...scope, userId: 10 }, 1001)).toEqual([]);
    const otherKey = agentOfflineKey({ ...scope, organizationId: 4 }, "list");
    s.setItem(otherKey, s.getItem(agentOfflineKey(scope, "list"))!);
    expect(loadLastAuthorizedAssignments(s, { ...scope, organizationId: 4 }, 1001)).toEqual([]);
  });
  it("expira em 15 minutos, remove payload expirado e rejeita relógio retrocedendo", () => {
    const s = memory();
    saveLastAuthorizedAssignments(s, scope, rows, 2000);
    expect(loadLastAuthorizedAssignments(s, scope, 1999)).toEqual([]);
    saveLastAuthorizedAssignments(s, scope, rows, 2000);
    expect(loadLastAuthorizedAssignments(s, scope, 2000 + AGENT_OFFLINE_TTL_MS)).toEqual([]);
    expect(s.getItem(agentOfflineKey(scope, "list"))).toBeNull();
  });
  it("rejeita cache adulterado e listas com campos inesperados", () => {
    const s = memory();
    const key = agentOfflineKey(scope, "list");
    s.setItem(key, JSON.stringify({ version: 1, scope, createdAt: 100, expiresAt: 100 + AGENT_OFFLINE_TTL_MS,
      payload: [{ id: 8, code: "OCO-8", category: "x", status: "inválido" }] }));
    expect(loadLastAuthorizedAssignments(s, scope, 110)).toEqual([]);
    expect(s.getItem(key)).toBeNull();
  });
  it("rascunho exige ação explícita; leitura não efetua envio remoto", () => {
    const s = memory();
    expect(loadAgentNoteDraft(s, scope, 15, 100)).toBeNull();
    saveAgentNoteDraft(s, scope, 15, "Atualização local", 100);
    expect(loadAgentNoteDraft(s, scope, 15, 101)).toBe("Atualização local");
    expect(loadAgentNoteDraft(s, scope, 16, 101)).toBeNull();
    deleteAgentNoteDraft(s, scope, 15);
    expect(loadAgentNoteDraft(s, scope, 15, 101)).toBeNull();
  });
  it("nega escopo inválido e notas muito grandes", () => {
    const s = memory();
    expect(() => saveAgentNoteDraft(s, { ...scope, teamId: 0 }, 15, "abc", 100)).toThrow();
    expect(() => saveAgentNoteDraft(s, scope, 15, "a".repeat(1001), 100)).toThrow();
  });
});
