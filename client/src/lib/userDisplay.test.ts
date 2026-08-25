import { describe, expect, it } from "vitest";
import { getUserDisplayName, getUserSecondaryIdentity } from "./userDisplay";

describe("identificação de usuário", () => {
  it("prioriza o nome de exibição e nunca usa o identificador técnico como nome", () => {
    expect(getUserDisplayName({ profile: { displayName: "Ana Souza" }, user: { name: "", email: "ana@axe.com.br", loginMethod: "manus" } })).toBe("Ana Souza");
    expect(getUserDisplayName({ profile: null, user: { name: null, email: "ana.souza@axe.com.br", loginMethod: "manus" } })).toBe("ana.souza");
    expect(getUserDisplayName({ profile: null, user: { name: null, email: null, loginMethod: "manus" } })).toBe("Usuário sem identificação nominal");
  });

  it("explica a situação da identidade sem expor o openId", () => {
    expect(getUserSecondaryIdentity({ user: { name: null, email: null, loginMethod: "preprovisioned" } })).toContain("Pré-cadastro manual");
    expect(getUserSecondaryIdentity({ user: { name: null, email: null, loginMethod: "manus" } })).toBe("Identidade corporativa não sincronizada");
  });
});
