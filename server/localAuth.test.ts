import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerLocalAuthSession } from "./localAuthSessions";

// Tests keep the database write isolated while exercising real JWT signing.
vi.mock("./localAuthSessions", () => ({
  registerLocalAuthSession: vi.fn(async () => {}),
  isLocalAuthSessionActive: vi.fn(async () => true),
  revokeLocalAuthSession: vi.fn(async () => {}),
}));
import { createLocalSessionToken, hashLocalPassword, nextLoginFailure, normalizeUsername, verifyLocalPassword, verifyLocalSessionToken } from "./localAuth";
import { getMenuItems } from "../client/src/components/DashboardLayout";

describe("autenticação local", () => {
  const verifiedHash = "scrypt$verified$hash";
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

  beforeEach(() => {
    vi.mocked(registerLocalAuthSession).mockReset();
    vi.mocked(registerLocalAuthSession).mockResolvedValue(undefined);
  });

  it("assina uma sessão com jti aleatório e a registra antes de entregar o JWT", async () => {
    const token = await createLocalSessionToken(42, verifiedHash);
    expect(token.split(".")).toHaveLength(3);
    const identity = await verifyLocalSessionToken(token);
    expect(identity).toEqual(expect.objectContaining({ kind: "local", userId: 42 }));
    expect(identity?.jti).toMatch(/^[a-f0-9]{64}$/);
    expect(identity?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(registerLocalAuthSession).toHaveBeenCalledWith({
      userId: 42,
      jti: identity?.jti,
      expiresAt: identity?.expiresAt,
    }, verifiedHash);
    const second = await createLocalSessionToken(42, verifiedHash);
    expect(second).not.toBe(token);
    expect((await verifyLocalSessionToken(second))?.jti).not.toBe(identity?.jti);
    await expect(verifyLocalSessionToken(token + "alterado")).resolves.toBeNull();
  });

  it("nega emissão do token quando não consegue persistir a sessão", async () => {
    vi.mocked(registerLocalAuthSession).mockRejectedValueOnce(new Error("Banco indisponível"));
    await expect(createLocalSessionToken(42, verifiedHash)).rejects.toThrow("Banco indisponível");
  });

  it("não cria token sem snapshot de credencial confirmada", async () => {
    await expect(createLocalSessionToken(42, "")).rejects.toThrow("Credenciais de sessão inválidas");
    expect(registerLocalAuthSession).not.toHaveBeenCalled();
  });

  it("nega identificadores de usuário incorretos antes de assinar", async () => {
    await expect(createLocalSessionToken(0, verifiedHash)).rejects.toThrow("Usuário inválido");
    await expect(createLocalSessionToken(Number.MAX_SAFE_INTEGER + 1, verifiedHash)).rejects.toThrow("Usuário inválido");
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
