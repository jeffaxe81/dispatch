import { describe, expect, it } from "vitest";
import { resolveSafeNeoRedirect, summarizeNeoProbeResponse } from "./neoEmbedProbe";

describe("summarizeNeoProbeResponse", () => {
  it("resume políticas de frame sem expor conteúdo desnecessário", () => {
    const result = summarizeNeoProbeResponse({
      url: "https://gscprj.saas.digitro.cloud/neo/",
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; frame-ancestors 'self' https://dispatch.example",
        "x-frame-options": "SAMEORIGIN",
      },
      setCookies: [],
    });

    expect(result).toMatchObject({
      url: "https://gscprj.saas.digitro.cloud/neo/",
      status: 200,
      contentType: "text/html; charset=utf-8",
      location: null,
      embedding: {
        embedding: "allowlist-specific",
        frameAncestors: ["'self'", "https://dispatch.example"],
      },
    });
  });

  it("registra apenas nome e atributos do cookie, nunca seu valor", () => {
    const secret = "session-secret-that-must-not-leak";
    const result = summarizeNeoProbeResponse({
      url: "https://gscprj.saas.digitro.cloud/neo/",
      status: 302,
      headers: {
        location: "/neo/login",
      },
      setCookies: [
        `neo_session=${secret}; Path=/; Secure; HttpOnly; SameSite=None`,
      ],
    });

    expect(result.location).toBe("/neo/login");
    expect(result.cookies).toEqual([
      {
        name: "neo_session",
        secure: true,
        sameSite: "none",
        thirdPartySuitable: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("trata cookie sem nome válido como entrada anônima sem vazar valor", () => {
    const result = summarizeNeoProbeResponse({
      url: "https://gscprj.saas.digitro.cloud/neo/",
      status: 200,
      headers: {},
      setCookies: ["=sensitive; Secure; SameSite=Lax"],
    });

    expect(result.cookies[0]?.name).toBe("<unnamed>");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
});

describe("resolveSafeNeoRedirect", () => {
  const current = "https://gscprj.saas.digitro.cloud/neo/";

  it("permite redirecionamento relativo dentro da origem NEO", () => {
    expect(resolveSafeNeoRedirect(current, "/neo/login")).toBe(
      "https://gscprj.saas.digitro.cloud/neo/login",
    );
  });

  it("permite URL absoluta somente quando permanece na mesma origem HTTPS", () => {
    expect(
      resolveSafeNeoRedirect(
        current,
        "https://gscprj.saas.digitro.cloud/neo/auth",
      ),
    ).toBe("https://gscprj.saas.digitro.cloud/neo/auth");
  });

  it("recusa redirecionamento para outro domínio", () => {
    expect(resolveSafeNeoRedirect(current, "https://login.example.com/auth")).toBeNull();
  });

  it("recusa downgrade para HTTP", () => {
    expect(resolveSafeNeoRedirect(current, "http://gscprj.saas.digitro.cloud/neo/login")).toBeNull();
  });
});
