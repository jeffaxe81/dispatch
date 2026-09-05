import {
  classifyEmbeddingHeaders,
  classifySetCookie,
  type EmbeddingPolicyResult,
} from "./neoEmbedPolicy";

export type NeoProbeCookieEvidence = {
  name: string;
  secure: boolean;
  sameSite: "none" | "lax" | "strict" | null;
  thirdPartySuitable: boolean;
};

export type NeoProbeResponseSummary = {
  url: string;
  status: number;
  contentType: string | null;
  location: string | null;
  embedding: EmbeddingPolicyResult;
  cookies: NeoProbeCookieEvidence[];
};

function normalizeHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function cookieName(setCookie: string): string {
  const firstSegment = setCookie.split(";", 1)[0]?.trim() ?? "";
  const separator = firstSegment.indexOf("=");
  if (separator <= 0) return "<unnamed>";
  const name = firstSegment.slice(0, separator).trim();
  return name || "<unnamed>";
}

function sanitizeLocation(location?: string): string | null {
  if (!location) return null;

  try {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(location);
    const parsed = new URL(location, "https://sanitizer.invalid");

    if (isAbsolute) return `${parsed.origin}${parsed.pathname}`;
    return parsed.pathname || "/";
  } catch {
    return "<unparseable>";
  }
}

export function resolveSafeNeoRedirect(
  currentUrl: string,
  location: string,
): string | null {
  try {
    const current = new URL(currentUrl);
    const next = new URL(location, current);

    if (current.protocol !== "https:" || next.protocol !== "https:") return null;
    if (next.origin !== current.origin) return null;

    return next.toString();
  } catch {
    return null;
  }
}

export function summarizeNeoProbeResponse(input: {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  setCookies: string[];
}): NeoProbeResponseSummary {
  const headers = normalizeHeaders(input.headers);

  return {
    url: input.url,
    status: input.status,
    contentType: headers["content-type"] ?? null,
    location: sanitizeLocation(headers.location),
    embedding: classifyEmbeddingHeaders(headers),
    cookies: input.setCookies.map(setCookie => ({
      name: cookieName(setCookie),
      ...classifySetCookie(setCookie),
    })),
  };
}
