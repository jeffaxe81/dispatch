import type { EmbeddingPolicyResult } from "./neoEmbedPolicy";

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

export function summarizeNeoProbeResponse(_input: {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  setCookies: string[];
}): NeoProbeResponseSummary {
  return {
    url: _input.url,
    status: _input.status,
    contentType: null,
    location: null,
    embedding: {
      embedding: "undetermined",
      frameAncestors: null,
      reasons: ["not-implemented"],
    },
    cookies: [],
  };
}
