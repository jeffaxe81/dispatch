import { describe, expect, it } from "vitest";
import { ENV, validateRuntimeEnv } from "./env";

describe("validação da configuração de segurança", () => {
  it("rejeita segredo JWT ausente, curto ou de exemplo", () => {
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: false, cookieSecret: "" })).toThrow("JWT_SECRET");
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: false, cookieSecret: "curto" })).toThrow("JWT_SECRET");
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: false, cookieSecret: "troque-por-um-segredo-longo-e-aleatorio" })).toThrow("JWT_SECRET");
  });

  it("exige banco e OAuth em produção", () => {
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: true, cookieSecret: "a".repeat(32), databaseUrl: "", appId: "", oAuthServerUrl: "", oAuthPortalUrl: "" })).toThrow("DATABASE_URL");
  });

  it("aceita configuração mínima segura", () => {
    expect(() => validateRuntimeEnv({ ...ENV, isProduction: true, cookieSecret: "a".repeat(32), databaseUrl: "mysql://db/app", appId: "axe", oAuthServerUrl: "https://login.example", oAuthPortalUrl: "https://portal.example" })).not.toThrow();
  });
});
