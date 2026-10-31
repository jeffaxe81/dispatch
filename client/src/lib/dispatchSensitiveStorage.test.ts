import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clearDispatchDataOnLogout, clearSensitiveDispatchStorage } from "./dispatchSensitiveStorage";

function storage(items: Record<string, string>) {
  const map = new Map(Object.entries(items));
  return {
    get length() { return map.size; },
    key(index: number) { return Array.from(map.keys())[index] ?? null; },
    removeItem(key: string) { map.delete(key); },
    has(key: string) { return map.has(key); },
    entries() { return Array.from(map.keys()); },
  };
}
describe("AXED-F050 — limpeza de dados locais sensíveis", () => {
  it("remove sessão de usuário e organização ativa sem apagar preferências genéricas", () => {
    const s = storage({"axe-dispatch-local-user": "{PII}", "dispatch.activeOrganizationId": "10", "dispatch.theme": "dark"});
    expect(clearSensitiveDispatchStorage(s)).toHaveLength(2);
    expect(s.entries()).toEqual(["dispatch.theme"]);
  });
  it("remove todas as visões Kanban de diferentes usuários e tenants no logout", () => {
    const s = storage({"dispatch.kanban.views.v1.1.10": "{search}", "dispatch.kanban.views.v1.2.11": "{}", "unrelated": "ok"});
    clearSensitiveDispatchStorage(s);
    expect(s.entries()).toEqual(["unrelated"]);
  });
  it("limpa futuras chaves offline sob namespace reservado", () => {
    const s = storage({"dispatch.offline.cache.v1.1.10": "sensitive", "dispatch.offline.drafts.10": "text"});
    clearSensitiveDispatchStorage(s);
    expect(s.length).toBe(0);
  });
  it("limpa tanto sessionStorage quanto localStorage, sem clear global", () => {
    const local = storage({"axe-dispatch-local-user": "user", "foreign.key": "untouched"});
    const session = storage({"dispatch.offline.draft": "secret", "foreign-session": "keep"});
    expect(clearDispatchDataOnLogout(local, session)).toEqual({
      local: ["axe-dispatch-local-user"], session: ["dispatch.offline.draft"],
    });
    expect(local.entries()).toEqual(["foreign.key"]);
    expect(session.entries()).toEqual(["foreign-session"]);
  });
  it("remoção é idempotente e não altera entradas durante a enumeração", () => {
    const s = storage({"dispatch.offline.a": "a", "dispatch.offline.b": "b", "dispatch.offline.c": "c"});
    expect(clearSensitiveDispatchStorage(s)).toHaveLength(3);
    expect(clearSensitiveDispatchStorage(s)).toEqual([]);
  });
  it("hook de logout apaga dados em finally e não serializa auth.me no navegador", () => {
    const hook = fs.readFileSync(path.resolve(import.meta.dirname, "../_core/hooks/useAuth.ts"), "utf8");
    expect(hook).toContain("clearDispatchDataOnLogout(window.localStorage, window.sessionStorage)");
    expect(hook).not.toContain("JSON.stringify(meQuery.data)");
    expect(hook).toContain('removeItem("axe-dispatch-local-user")');
  });
});
