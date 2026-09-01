import { describe, expect, it } from "vitest";
import { validateIntegrationEnvironment } from "./integrationEnvironment";

const completeEnvironment = {
  DATABASE_URL: "mysql://integration.test/dispatch",
  JWT_SECRET: "integration-test-session-secret-2026",
  LOCAL_AUTH_BOOTSTRAP_USERNAME: "integration.admin",
  LOCAL_AUTH_BOOTSTRAP_PASSWORD: "integration-password-2026",
};

describe("ambiente dos testes de integração", () => {
  it("aceita todas as variáveis obrigatórias", () => {
    expect(() =>
      validateIntegrationEnvironment(completeEnvironment),
    ).not.toThrow();
  });

  it("informa todas as variáveis ausentes sem expor valores", () => {
    expect(() =>
      validateIntegrationEnvironment({ DATABASE_URL: "mysql://test/app" }),
    ).toThrow(
      "Testes de integração exigem: JWT_SECRET, LOCAL_AUTH_BOOTSTRAP_USERNAME, LOCAL_AUTH_BOOTSTRAP_PASSWORD",
    );
  });
});
