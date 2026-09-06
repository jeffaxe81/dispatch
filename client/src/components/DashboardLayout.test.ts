import { describe, expect, it, vi } from "vitest";
import { completeLogout, getMenuItems, isLogoutShortcut } from "./DashboardLayout";

describe("navegação por perfil operacional", () => {
  it("oculta Central e Kanban para Agente de Campo, mesmo quando as permissões existirem", () => {
    const labels = getMenuItems(["occurrences.view", "teams.view", "dispatch.view", "occurrences.transition"], "agente").map(item => item.label);
    expect(labels).not.toContain("Central");
    expect(labels).not.toContain("Kanban");
    expect(labels).toContain("Aplicativo Agente");
    expect(labels).toContain("Equipes");
  });

  it("oculta Central e Kanban quando o perfil dinâmico é Agente de Campo, mesmo se a sessão ainda informar Operador", () => {
    const labels = getMenuItems(["occurrences.view", "dispatch.view", "occurrences.transition"], "operador", false, [{ roleCode: "agente_campo" }]).map(item => item.label);
    expect(labels).not.toContain("Central");
    expect(labels).not.toContain("Kanban");
    expect(labels).toContain("Aplicativo Agente");
  });

  it("preserva Central e Kanban para perfis da central com permissões correspondentes", () => {
    const labels = getMenuItems(["occurrences.view", "dispatch.view", "reports.view"], "despachador").map(item => item.label);
    expect(labels).toContain("Central");
    expect(labels).toContain("Kanban");
    expect(labels).toContain("Dashboards e Relatórios");
  });

  it("exibe Formulários apenas com forms.view e nunca para agente de campo", () => {
    expect(getMenuItems(["forms.view"], "operador").map(item => item.label)).toContain("Formulários");
    expect(getMenuItems([], "operador").map(item => item.label)).not.toContain("Formulários");
    expect(getMenuItems(["forms.view"], "agente").map(item => item.label)).not.toContain("Formulários");
  });

  it("exibe todos os grupos laterais para o superadministrador", () => {
    const labels = getMenuItems([], "administrador", true).map(item => item.label);
    expect(labels).toEqual(expect.arrayContaining([
      "Central", "Ocorrências", "Formulários", "Dashboards e Relatórios", "Equipes", "Kanban",
      "Aplicativo Agente", "Viaturas", "Integrações", "Administração", "Usuários",
      "Perfis", "Escopos", "Log de operações", "Configurações",
    ]));
  });

  it("exibe todos os itens para o curinga administrativo devolvido pelo fallback legado", () => {
    const labels = getMenuItems(["*"], "administrador").map(item => item.label);
    expect(labels).toEqual(expect.arrayContaining([
      "Central", "Ocorrências", "Formulários", "Dashboards e Relatórios", "Equipes", "Kanban",
      "Viaturas", "Integrações", "Administração", "Usuários", "Perfis", "Escopos", "Log de operações",
    ]));
  });

  it("encerra a sessão e redireciona para a tela inicial", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const redirect = vi.fn();
    await completeLogout(logout, redirect);
    expect(logout).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("reconhece Ctrl/⌘ + Shift + L sem conflitar com combinações incompletas ou repetidas", () => {
    expect(isLogoutShortcut({ key: "l", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, repeat: false })).toBe(true);
    expect(isLogoutShortcut({ key: "L", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false, repeat: false })).toBe(true);
    expect(isLogoutShortcut({ key: "l", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false })).toBe(false);
    expect(isLogoutShortcut({ key: "l", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, repeat: true })).toBe(false);
  });
});