import { describe, expect, it } from "vitest";
import { validateEmbeddedIntegrationInput } from "./embeddedIntegration";

describe("CP-016 embedded integration validation", () => {
  it("accepts the approved NEO HTTPS base URL", () => {
    expect(
      validateEmbeddedIntegrationInput({
        code: "neo-interact",
        name: "NEO Interact",
        url: "https://gscprj.saas.digitro.cloud/neo/",
        allowedRoles: ["operador", "despachador", "supervisor", "administrador"],
        displayMode: "embedded",
      }),
    ).toEqual({
      code: "neo-interact",
      name: "NEO Interact",
      url: "https://gscprj.saas.digitro.cloud/neo/",
      allowedRoles: ["operador", "despachador", "supervisor", "administrador"],
      displayMode: "embedded",
    });
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() =>
      validateEmbeddedIntegrationInput({
        code: "neo",
        name: "NEO",
        url: "http://gscprj.saas.digitro.cloud/neo/",
        allowedRoles: ["administrador"],
        displayMode: "embedded",
      }),
    ).toThrow("HTTPS");
  });

  it("rejects URLs containing embedded credentials", () => {
    expect(() =>
      validateEmbeddedIntegrationInput({
        code: "neo",
        name: "NEO",
        url: "https://user:pass@gscprj.saas.digitro.cloud/neo/",
        allowedRoles: ["administrador"],
        displayMode: "embedded",
      }),
    ).toThrow("credenciais");
  });

  it("rejects unsupported roles", () => {
    expect(() =>
      validateEmbeddedIntegrationInput({
        code: "neo",
        name: "NEO",
        url: "https://gscprj.saas.digitro.cloud/neo/",
        allowedRoles: ["root"],
        displayMode: "embedded",
      }),
    ).toThrow("perfil");
  });
});
