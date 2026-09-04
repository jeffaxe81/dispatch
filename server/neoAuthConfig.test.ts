import { describe, expect, it } from "vitest";
import { getNeoAuthConfig, summarizeNeoAuthOutcome } from "./neoAuthConfig";

describe("getNeoAuthConfig", () => {
  it("retorna credenciais somente quando usuário e senha existem", () => {
    expect(
      getNeoAuthConfig({
        NEO_AUTH_USERNAME: "user@example.com",
        NEO_AUTH_PASSWORD: "secret-value",
      }),
    ).toEqual({
      username: "user@example.com",
      password: "secret-value",
    });
  });

  it("não retorna configuração parcial", () => {
    expect(getNeoAuthConfig({ NEO_AUTH_USERNAME: "user@example.com" })).toBeNull();
    expect(getNeoAuthConfig({ NEO_AUTH_PASSWORD: "secret-value" })).toBeNull();
  });
});

describe("summarizeNeoAuthOutcome", () => {
  it("nunca inclui usuário ou senha no resumo persistido", () => {
    const summary = summarizeNeoAuthOutcome({
      status: "authenticated",
      currentUrl: "https://gscprj.saas.digitro.cloud/neo/app?token=private#secret",
      username: "user@example.com",
      password: "secret-value",
    });

    expect(summary).toEqual({
      status: "authenticated",
      currentUrl: "https://gscprj.saas.digitro.cloud/neo/app",
    });
    expect(JSON.stringify(summary)).not.toContain("user@example.com");
    expect(JSON.stringify(summary)).not.toContain("secret-value");
  });

  it("preserva estados técnicos sem detalhes sensíveis", () => {
    expect(
      summarizeNeoAuthOutcome({
        status: "interactive-auth-required",
        currentUrl: "https://gscprj.saas.digitro.cloud/neo/login",
      }),
    ).toEqual({
      status: "interactive-auth-required",
      currentUrl: "https://gscprj.saas.digitro.cloud/neo/login",
    });
  });
});
