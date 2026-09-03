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

export function classifyEmbeddingHeaders(
  _headers: Record<string, string | undefined>,
): EmbeddingPolicyResult {
  return {
    embedding: "undetermined",
    frameAncestors: null,
    reasons: ["not-implemented"],
  };
}

export function classifySetCookie(_setCookie: string): CookiePolicyResult {
  return {
    secure: false,
    sameSite: null,
    thirdPartySuitable: false,
  };
}
