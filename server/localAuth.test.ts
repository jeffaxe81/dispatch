import { describe, expect, it } from "vitest";
import { createLocalSessionToken, hashLocalPassword, nextLoginFailure, normalizeUsername, verifyLocalPassword, verifyLocalSessionToken } from "./localAuth";
import { getMenuItems } from "../client/src/components/DashboardLayout";

describe("autenticação local", () => {
  it("normaliza o identificador e deriva uma senha que não pode ser validada por texto incorreto", async () => {
    const hash = await hashLocalPassword("senha-local-segura");
    expect(normalizeUsername("  Central.Admin ")).toBe("central.admin");
    expect(hash).not.toContain("senha-local-segura");
    await expect(verifyLocalPassword("senha-local-segura", hash)).resolves.toBe(true);
    await expect(verifyLocalPassword("senha-incorreta", hash)).resolves.toBe(false);
  });

  it("bloqueia temporariamente após cinco falhas consecutivas", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(nextLoginFailure(3, now)).toEqual({ failedLoginAttempts: 4, lockedUntil: null });
    const locked = nextLoginFailure(4, now);
    expect(locked.failedLoginAttempts).toBe(5);
    expect(locked.lockedUntil?.toISOString()).toBe("2026-08-25T12:15:00.000Z");
  });

  it("assina e verifica uma sessão local sem transportar credenciais", async () => {
    const token = await createLocalSessionToken(42);
    expect(token.split(".")).toHaveLength(3);
    await expect(verifyLocalSessionToken(token)).resolves.toEqual({ kind: "local", userId: 42 });
  });

  it("mantém a navegação adequada para administrador, despachador e agente", () => {
    const administrator = getMenuItems([], "administrador", true).map(item => item.label);
    const dispatcher = getMenuItems(undefined, "despachador", false).map(item => item.label);
    const fieldAgent = getMenuItems(undefined, "agente", false, []).map(item => item.label);
    expect(administrator).toEqual(expect.arrayContaining(["Central", "Administração", "Credenciais locais"]));
    expect(dispatcher).toEqual(expect.arrayContaining(["Central", "Kanban"]));
    expect(fieldAgent).toContain("Aplicativo Agente");
    expect(fieldAgent).not.toContain("Central");
  });
});
