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
    location: headers.location ?? null,
    embedding: classifyEmbeddingHeaders(headers),
    cookies: input.setCookies.map(setCookie => ({
      name: cookieName(setCookie),
      ...classifySetCookie(setCookie),
    })),
  };
}
