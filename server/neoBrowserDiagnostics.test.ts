import { describe, expect, it } from "vitest";
import {
  sanitizeBrowserDiagnosticUrl,
  summarizeNeoDocumentResponse,
  summarizeNeoNetworkFailure,
} from "./neoBrowserDiagnostics";

const NEO_ORIGIN = "https://gscprj.saas.digitro.cloud";

describe("sanitizeBrowserDiagnosticUrl", () => {
  it("remove query e fragmento de URL HTTPS", () => {
    expect(
      sanitizeBrowserDiagnosticUrl(
        "https://gscprj.saas.digitro.cloud/neo/auth?code=secret&state=opaque#fragment",
      ),
    ).toBe("https://gscprj.saas.digitro.cloud/neo/auth");
  });

  it("não persiste conteúdo de data/blob URLs", () => {
    expect(sanitizeBrowserDiagnosticUrl("data:text/html,secret-value")).toBe("data:<redacted>");
    expect(sanitizeBrowserDiagnosticUrl("blob:https://example.com/private-token")).toBe("blob:<redacted>");
  });

  it("preserva about:blank como estado técnico conhecido", () => {
    expect(sanitizeBrowserDiagnosticUrl("about:blank")).toBe("about:blank");
  });
});

describe("summarizeNeoDocumentResponse", () => {
  it("resume somente documento da origem NEO e classifica política de frame", () => {
    const result = summarizeNeoDocumentResponse(
      {
        url: "https://gscprj.saas.digitro.cloud/neo/?token=must-not-leak",
        status: 200,
        mimeType: "text/html",
        headers: {
          "Content-Security-Policy": "frame-ancestors 'self' https://dispatch.example",
          "X-Frame-Options": "SAMEORIGIN",
        },
      },
      NEO_ORIGIN,
    );

    expect(result).toMatchObject({
      url: "https://gscprj.saas.digitro.cloud/neo/",
      status: 200,
      mimeType: "text/html",
      embedding: {
        embedding: "allowlist-specific",
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("ignora respostas document de outra origem", () => {
    expect(
      summarizeNeoDocumentResponse(
        {
          url: "https://identity.example.com/login",
          status: 200,
          mimeType: "text/html",
          headers: {},
        },
        NEO_ORIGIN,
      ),
    ).toBeNull();
  });
});

describe("summarizeNeoNetworkFailure", () => {
  it("resume falha da origem NEO sem query e com erro técnico allowlisted", () => {
    expect(
      summarizeNeoNetworkFailure(
        {
          url: "https://gscprj.saas.digitro.cloud/neo/app.js?session=secret",
          errorText: "net::ERR_BLOCKED_BY_RESPONSE",
          blockedReason: "csp",
          resourceType: "Script",
          canceled: false,
        },
        NEO_ORIGIN,
      ),
    ).toEqual({
      url: "https://gscprj.saas.digitro.cloud/neo/app.js",
      error: "net::ERR_BLOCKED_BY_RESPONSE",
      blockedReason: "csp",
      resourceType: "Script",
      canceled: false,
    });
  });

  it("redige texto de erro arbitrário e ignora outra origem", () => {
    const secret = "private-message-must-not-leak";
    const result = summarizeNeoNetworkFailure(
      {
        url: "https://gscprj.saas.digitro.cloud/neo/api",
        errorText: secret,
        resourceType: "Fetch",
        canceled: false,
      },
      NEO_ORIGIN,
    );

    expect(result?.error).toBe("<redacted-error>");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(
      summarizeNeoNetworkFailure(
        {
          url: "https://other.example/api",
          errorText: "net::ERR_FAILED",
          resourceType: "Fetch",
          canceled: false,
        },
        NEO_ORIGIN,
      ),
    ).toBeNull();
  });
});
