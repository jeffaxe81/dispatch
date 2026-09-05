import { describe, expect, it } from "vitest";
import {
  createNeoCdpDiagnosticCollector,
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

describe("createNeoCdpDiagnosticCollector", () => {
  it("correlaciona requestId, conserva apenas documento NEO e falhas NEO e redige segredos", () => {
    const collector = createNeoCdpDiagnosticCollector(NEO_ORIGIN);

    collector.onRequestWillBeSent({
      requestId: "doc-1",
      type: "Document",
      request: { url: "https://gscprj.saas.digitro.cloud/neo/?token=secret" },
    });
    collector.onResponseReceived({
      requestId: "doc-1",
      type: "Document",
      response: {
        url: "https://gscprj.saas.digitro.cloud/neo/?token=secret",
        status: 200,
        mimeType: "text/html",
        headers: { "x-frame-options": "SAMEORIGIN" },
      },
    });

    collector.onRequestWillBeSent({
      requestId: "script-1",
      type: "Script",
      request: { url: "https://gscprj.saas.digitro.cloud/neo/app.js?session=secret" },
    });
    collector.onLoadingFailed({
      requestId: "script-1",
      errorText: "private-message-must-not-leak",
      blockedReason: "csp",
      canceled: false,
    });

    collector.onResponseReceived({
      requestId: "other-doc",
      type: "Document",
      response: {
        url: "https://identity.example.com/login?code=secret",
        status: 302,
        mimeType: "text/html",
        headers: {},
      },
    });

    const report = collector.snapshot();
    expect(report.documents).toEqual([
      {
        url: "https://gscprj.saas.digitro.cloud/neo/",
        status: 200,
        mimeType: "text/html",
        embedding: { embedding: "same-origin-only" },
      },
    ]);
    expect(report.failures).toEqual([
      {
        url: "https://gscprj.saas.digitro.cloud/neo/app.js",
        error: "<redacted-error>",
        blockedReason: "csp",
        resourceType: "Script",
        canceled: false,
      },
    ]);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("private-message-must-not-leak");
  });

  it("mantém histórico limitado e informa se o documento NEO foi observado", () => {
    const collector = createNeoCdpDiagnosticCollector(NEO_ORIGIN, { maxEntries: 2 });

    for (let index = 0; index < 3; index += 1) {
      const requestId = `doc-${index}`;
      collector.onRequestWillBeSent({
        requestId,
        type: "Document",
        request: { url: `https://gscprj.saas.digitro.cloud/neo/page-${index}` },
      });
      collector.onResponseReceived({
        requestId,
        type: "Document",
        response: {
          url: `https://gscprj.saas.digitro.cloud/neo/page-${index}`,
          status: 200,
          mimeType: "text/html",
          headers: {},
        },
      });
    }

    const report = collector.snapshot();
    expect(report.neoDocumentObserved).toBe(true);
    expect(report.documents).toHaveLength(2);
    expect(report.documents.map(item => item.url)).toEqual([
      "https://gscprj.saas.digitro.cloud/neo/page-1",
      "https://gscprj.saas.digitro.cloud/neo/page-2",
    ]);
  });
});
