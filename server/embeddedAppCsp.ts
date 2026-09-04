import type { RequestHandler } from "express";
import type { EmbeddedApplication } from "@shared/embeddedApplications";

type EmbeddedApplicationFrameSource = Pick<
  EmbeddedApplication,
  "origin" | "enabled"
>;

function authorizedHttpsOrigins(
  applications: readonly EmbeddedApplicationFrameSource[],
): string[] {
  const origins = new Set<string>();

  for (const application of applications) {
    if (!application.enabled) continue;

    try {
      const parsed = new URL(application.origin);
      if (parsed.protocol !== "https:") continue;
      if (parsed.origin !== application.origin) continue;
      origins.add(parsed.origin);
    } catch {
      // Invalid origins are never promoted into CSP.
    }
  }

  return [...origins].sort();
}

export function buildEmbeddedApplicationFrameSrcDirective(
  applications: readonly EmbeddedApplicationFrameSource[],
): string {
  const origins = authorizedHttpsOrigins(applications);
  return ["frame-src", "'self'", ...origins].join(" ");
}

export function mergeEmbeddedApplicationFrameSrcCsp(
  currentPolicy: string | null | undefined,
  applications: readonly EmbeddedApplicationFrameSource[],
): string {
  const directives = (currentPolicy ?? "")
    .split(";")
    .map(directive => directive.trim())
    .filter(Boolean)
    .filter(directive => !/^frame-src(?:\s|$)/i.test(directive));

  directives.push(buildEmbeddedApplicationFrameSrcDirective(applications));
  return `${directives.join("; ")};`;
}

export function createEmbeddedApplicationCspMiddleware(
  applications: readonly EmbeddedApplicationFrameSource[],
): RequestHandler {
  return (_request, response, next) => {
    const currentHeader = response.getHeader("Content-Security-Policy");
    const currentPolicy = Array.isArray(currentHeader)
      ? currentHeader.join("; ")
      : typeof currentHeader === "string"
        ? currentHeader
        : undefined;

    response.setHeader(
      "Content-Security-Policy",
      mergeEmbeddedApplicationFrameSrcCsp(currentPolicy, applications),
    );
    next();
  };
}
