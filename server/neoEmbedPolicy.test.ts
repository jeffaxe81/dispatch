import { describe, expect, it } from "vitest";
import { classifyEmbeddingHeaders, classifySetCookie } from "./neoEmbedPolicy";

describe("classifyEmbeddingHeaders", () => {
  it("classifica X-Frame-Options DENY como bloqueio global", () => {
    const result = classifyEmbeddingHeaders({
      "x-frame-options": "DENY",
    });

    expect(result.embedding).toBe("blocked");
    expect(result.reasons).toContain("x-frame-options:deny");
  });

  it("classifica SAMEORIGIN como incorporação restrita à mesma origem", () => {
    const result = classifyEmbeddingHeaders({
      "x-frame-options": "SAMEORIGIN",
    });

    expect(result.embedding).toBe("same-origin-only");
    expect(result.reasons).toContain("x-frame-options:sameorigin");
  });

  it("prioriza CSP frame-ancestors none como bloqueio global", () => {
    const result = classifyEmbeddingHeaders({
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'; script-src 'self'",
      "x-frame-options": "SAMEORIGIN",
    });

    expect(result.embedding).toBe("blocked");
    expect(result.frameAncestors).toEqual(["'none'"]);
    expect(result.reasons).toContain("csp:frame-ancestors:none");
  });

  it("preserva a allowlist declarada em frame-ancestors para homologação por origem", () => {
    const result = classifyEmbeddingHeaders({
      "content-security-policy": "frame-ancestors 'self' https://dispatch.example https://*.axe.example",
    });

    expect(result.embedding).toBe("allowlist-specific");
    expect(result.frameAncestors).toEqual([
      "'self'",
      "https://dispatch.example",
      "https://*.axe.example",
    ]);
  });

  it("mantém resultado indeterminado quando nenhum cabeçalho de frame é observado", () => {
    const result = classifyEmbeddingHeaders({
      "content-type": "text/html",
    });

    expect(result.embedding).toBe("undetermined");
    expect(result.reasons).toContain("no-frame-policy-header-observed");
  });
});

describe("classifySetCookie", () => {
  it("considera cookie Secure + SameSite=None apto ao contexto third-party", () => {
    expect(classifySetCookie("neo_session=abc; Path=/; Secure; HttpOnly; SameSite=None")).toMatchObject({
      secure: true,
      sameSite: "none",
      thirdPartySuitable: true,
    });
  });

  it("não considera SameSite=Lax apto ao contexto third-party de iframe", () => {
    expect(classifySetCookie("neo_session=abc; Path=/; Secure; HttpOnly; SameSite=Lax")).toMatchObject({
      secure: true,
      sameSite: "lax",
      thirdPartySuitable: false,
    });
  });
});
