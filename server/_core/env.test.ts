import { describe, expect, it } from "vitest";
import { ENV, validateRuntimeEnv } from "./env";

describe("validação da configuração de segurança", () => {
  it("rejeita segredo JWT ausente, curto ou de exemplo", () => {
    const externalRuntime = { ...ENV, isProduction: false, forgeApiUrl: "", forgeApiKey: "" };
    expect(() => validateRuntimeEnv({ ...externalRuntime, cookieSecret: "" })).toThrow("JWT_SECRET");
    expect(() => validateRuntimeEnv({ ...externalRuntime, cookieSecret: "curto" })).toThrow("JWT_SECRET");
    expect(() => validateRuntimeEnv({ ...externalRuntime, cookieSecret: "a".repeat(22) })).toThrow("JWT_SECRET");
    expect(() => validateRuntimeEnv({ ...externalRuntime, cookieSecret: "troque-por-um-segredo-longo-e-aleatorio" })).toThrow("JWT_SECRET");
  });

  it("exige banco e OAuth em produção", () => {
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: true, cookieSecret: "a".repeat(32), databaseUrl: "", appId: "", oAuthServerUrl: "", oAuthPortalUrl: "" })).toThrow("DATABASE_URL");
  });

  it("aceita configuração mínima segura", () => {
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: true, cookieSecret: "a".repeat(32), databaseUrl: "mysql://db/app", appId: "axe", oAuthServerUrl: "https://login.example", oAuthPortalUrl: "https://portal.example" })).not.toThrow();
  });

  it("aceita o segredo compacto e diversificado fornecido pelo runtime gerenciado", () => {
    const managedRuntime = { ...ENV, isProduction: true, cookieSecret: "M7nA4qZp8Lw2Rs6Tx9Vu", databaseUrl: "mysql://db/app", appId: "axe", oAuthServerUrl: "https://login.example", oAuthPortalUrl: "https://portal.example" };
    expect(() => validateRuntimeEnv(managedRuntime)).not.toThrow();
  });
});
