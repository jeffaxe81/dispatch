export type EmbeddingClassification =
  | "blocked"
  | "same-origin-only"
  | "allowlist-specific"
  | "undetermined";

export type EmbeddingPolicyResult = {
  embedding: EmbeddingClassification;
  frameAncestors: string[] | null;
  reasons: string[];
};

export type CookiePolicyResult = {
  secure: boolean;
  sameSite: "none" | "lax" | "strict" | null;
  thirdPartySuitable: boolean;
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

function parseFrameAncestors(contentSecurityPolicy?: string): string[] | null {
  if (!contentSecurityPolicy) return null;

  for (const rawDirective of contentSecurityPolicy.split(";")) {
    const directive = rawDirective.trim();
    if (!directive) continue;

    const tokens = directive.split(/\s+/);
    if (tokens[0]?.toLowerCase() !== "frame-ancestors") continue;

    return tokens.slice(1);
  }

  return null;
}

export function classifyEmbeddingHeaders(
  headers: Record<string, string | undefined>,
): EmbeddingPolicyResult {
  const normalized = normalizeHeaders(headers);
  const frameAncestors = parseFrameAncestors(normalized["content-security-policy"]);
  const xFrameOptions = normalized["x-frame-options"]?.trim().toUpperCase();
  const reasons: string[] = [];

  if (frameAncestors) {
    const normalizedAncestors = frameAncestors.map(value => value.toLowerCase());

    if (normalizedAncestors.includes("'none'")) {
      reasons.push("csp:frame-ancestors:none");
      return { embedding: "blocked", frameAncestors, reasons };
    }

    if (frameAncestors.length === 1 && normalizedAncestors[0] === "'self'") {
      reasons.push("csp:frame-ancestors:self");
      return { embedding: "same-origin-only", frameAncestors, reasons };
    }

    reasons.push("csp:frame-ancestors:allowlist");
    return { embedding: "allowlist-specific", frameAncestors, reasons };
  }

  if (xFrameOptions === "DENY") {
    reasons.push("x-frame-options:deny");
    return { embedding: "blocked", frameAncestors: null, reasons };
  }

  if (xFrameOptions === "SAMEORIGIN") {
    reasons.push("x-frame-options:sameorigin");
    return { embedding: "same-origin-only", frameAncestors: null, reasons };
  }

  if (xFrameOptions) {
    reasons.push(`x-frame-options:${xFrameOptions.toLowerCase()}`);
    return { embedding: "undetermined", frameAncestors: null, reasons };
  }

  reasons.push("no-frame-policy-header-observed");
  return { embedding: "undetermined", frameAncestors: null, reasons };
}

export function classifySetCookie(setCookie: string): CookiePolicyResult {
  const attributes = setCookie
    .split(";")
    .slice(1)
    .map(value => value.trim().toLowerCase());

  const secure = attributes.includes("secure");
  const sameSiteAttribute = attributes.find(value => value.startsWith("samesite="));
  const rawSameSite = sameSiteAttribute?.slice("samesite=".length) ?? null;
  const sameSite =
    rawSameSite === "none" || rawSameSite === "lax" || rawSameSite === "strict"
      ? rawSameSite
      : null;

  return {
    secure,
    sameSite,
    thirdPartySuitable: secure && sameSite === "none",
  };
}
