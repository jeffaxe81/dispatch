type HeaderMap = Record<string, string | undefined>;

type NeoDocumentResponseInput = {
  url: string;
  status: number;
  mimeType: string;
  headers: HeaderMap;
};

type NeoNetworkFailureInput = {
  url: string;
  errorText?: string;
  blockedReason?: string;
  resourceType?: string;
  canceled?: boolean;
};

type CdpRequestWillBeSent = {
  requestId: string;
  type?: string;
  request: { url: string };
};

type CdpResponseReceived = {
  requestId: string;
  type?: string;
  response: NeoDocumentResponseInput;
};

type CdpLoadingFailed = {
  requestId: string;
  errorText?: string;
  blockedReason?: string;
  canceled?: boolean;
};

const ALLOWED_NETWORK_ERRORS = new Set([
  "net::ERR_ABORTED",
  "net::ERR_BLOCKED_BY_CLIENT",
  "net::ERR_BLOCKED_BY_RESPONSE",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_REFUSED",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_FAILED",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NAME_NOT_RESOLVED",
  "net::ERR_TIMED_OUT",
]);

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getHeader(headers: HeaderMap, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function pushBounded<T>(target: T[], value: T, maxEntries: number) {
  target.push(value);
  while (target.length > maxEntries) target.shift();
}

export function sanitizeBrowserDiagnosticUrl(value: string): string {
  if (value === "about:blank") return value;
  if (value.startsWith("data:")) return "data:<redacted>";
  if (value.startsWith("blob:")) return "blob:<redacted>";

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `${url.protocol}<redacted>`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "<redacted-url>";
  }
}

function classifyEmbedding(headers: HeaderMap) {
  const csp = getHeader(headers, "content-security-policy") ?? "";
  const xFrameOptions = (getHeader(headers, "x-frame-options") ?? "").trim().toUpperCase();
  const frameAncestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1]?.trim();

  if (frameAncestors) {
    const normalized = frameAncestors.toLowerCase();
    if (normalized.includes("'none'")) return { embedding: "blocked" as const };
    if (normalized === "'self'") return { embedding: "same-origin-only" as const };
    if (normalized.includes("*")) return { embedding: "allow-all" as const };
    return { embedding: "allowlist-specific" as const };
  }

  if (xFrameOptions === "DENY") return { embedding: "blocked" as const };
  if (xFrameOptions === "SAMEORIGIN") return { embedding: "same-origin-only" as const };
  return { embedding: "not-declared" as const };
}

export function summarizeNeoDocumentResponse(
  input: NeoDocumentResponseInput,
  neoOrigin: string,
) {
  const inputOrigin = normalizedOrigin(input.url);
  const expectedOrigin = normalizedOrigin(neoOrigin);
  if (!inputOrigin || !expectedOrigin || inputOrigin !== expectedOrigin) return null;

  return {
    url: sanitizeBrowserDiagnosticUrl(input.url),
    status: input.status,
    mimeType: input.mimeType,
    embedding: classifyEmbedding(input.headers),
  };
}

export function summarizeNeoNetworkFailure(
  input: NeoNetworkFailureInput,
  neoOrigin: string,
) {
  const inputOrigin = normalizedOrigin(input.url);
  const expectedOrigin = normalizedOrigin(neoOrigin);
  if (!inputOrigin || !expectedOrigin || inputOrigin !== expectedOrigin) return null;

  const error = input.errorText && ALLOWED_NETWORK_ERRORS.has(input.errorText)
    ? input.errorText
    : "<redacted-error>";

  return {
    url: sanitizeBrowserDiagnosticUrl(input.url),
    error,
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    canceled: Boolean(input.canceled),
  };
}

export function createNeoCdpDiagnosticCollector(
  neoOrigin: string,
  options: { maxEntries?: number } = {},
) {
  const maxEntries = Math.max(1, options.maxEntries ?? 50);
  const requests = new Map<string, { url: string; resourceType?: string }>();
  const documents: NonNullable<ReturnType<typeof summarizeNeoDocumentResponse>>[] = [];
  const failures: NonNullable<ReturnType<typeof summarizeNeoNetworkFailure>>[] = [];
  let neoDocumentObserved = false;

  return {
    onRequestWillBeSent(event: CdpRequestWillBeSent) {
      requests.set(event.requestId, {
        url: event.request.url,
        resourceType: event.type,
      });
    },

    onResponseReceived(event: CdpResponseReceived) {
      if (event.type !== "Document") return;
      const summary = summarizeNeoDocumentResponse(event.response, neoOrigin);
      if (!summary) return;
      neoDocumentObserved = true;
      pushBounded(documents, summary, maxEntries);
    },

    onLoadingFailed(event: CdpLoadingFailed) {
      const request = requests.get(event.requestId);
      if (!request) return;
      requests.delete(event.requestId);
      const summary = summarizeNeoNetworkFailure(
        {
          url: request.url,
          errorText: event.errorText,
          blockedReason: event.blockedReason,
          resourceType: request.resourceType,
          canceled: event.canceled,
        },
        neoOrigin,
      );
      if (summary) pushBounded(failures, summary, maxEntries);
    },

    snapshot() {
      return {
        neoDocumentObserved,
        documents: [...documents],
        failures: [...failures],
      };
    },
  };
}
