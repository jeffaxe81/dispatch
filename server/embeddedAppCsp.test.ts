import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EMBEDDED_APPLICATIONS } from "@shared/embeddedApplications";
import {
  buildEmbeddedApplicationFrameSrcDirective,
  createEmbeddedApplicationCspMiddleware,
  mergeEmbeddedApplicationFrameSrcCsp,
} from "./embeddedAppCsp";

describe("CSP de aplicações incorporadas", () => {
  it("autoriza somente self e origins HTTPS configuradas, sem caminho ou wildcard", () => {
    const directive = buildEmbeddedApplicationFrameSrcDirective(EMBEDDED_APPLICATIONS);

    expect(directive).toBe("frame-src 'self' https://gscprj.saas.digitro.cloud");
    expect(directive).not.toContain("/neo/");
    expect(directive).not.toContain("*");
  });

  it("remove duplicidades de origin", () => {
    const duplicate = [
      ...EMBEDDED_APPLICATIONS,
      { ...EMBEDDED_APPLICATIONS[0], id: "neo-interact-copy" },
    ];

    expect(buildEmbeddedApplicationFrameSrcDirective(duplicate))
      .toBe("frame-src 'self' https://gscprj.saas.digitro.cloud");
  });

  it("preserva outras diretivas CSP ao adicionar frame-src", () => {
    expect(
      mergeEmbeddedApplicationFrameSrcCsp(
        "default-src 'self'; script-src 'self'",
        EMBEDDED_APPLICATIONS,
      ),
    ).toBe(
      "default-src 'self'; script-src 'self'; frame-src 'self' https://gscprj.saas.digitro.cloud;",
    );
  });

  it("substitui frame-src existente em vez de manter origem ou wildcard não autorizado", () => {
    const merged = mergeEmbeddedApplicationFrameSrcCsp(
      "default-src 'self'; frame-src * https://old.invalid; img-src 'self' data:",
      EMBEDDED_APPLICATIONS,
    );

    expect(merged).toBe(
      "default-src 'self'; img-src 'self' data:; frame-src 'self' https://gscprj.saas.digitro.cloud;",
    );
    expect(merged).not.toContain("old.invalid");
    expect(merged).not.toContain("frame-src *");
  });

  it("aplica frame-src sem apagar uma política CSP já existente", () => {
    const headers = new Map<string, string | number | readonly string[]>([
      ["Content-Security-Policy", "default-src 'self'; img-src 'self' data:"],
    ]);
    const response = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: string | number | readonly string[]) => {
        headers.set(name, value);
        return response;
      },
    };
    const next = vi.fn();

    createEmbeddedApplicationCspMiddleware(EMBEDDED_APPLICATIONS)(
      {} as never,
      response as never,
      next,
    );

    expect(headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; img-src 'self' data:; frame-src 'self' https://gscprj.saas.digitro.cloud;",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("registra o middleware CSP no servidor antes das rotas tRPC", () => {
    const source = readFileSync(
      new URL("./_core/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { EMBEDDED_APPLICATIONS } from "@shared/embeddedApplications";',
    );
    expect(source).toContain(
      'import { createEmbeddedApplicationCspMiddleware } from "../embeddedAppCsp";',
    );

    const middlewareIndex = source.indexOf(
      "app.use(createEmbeddedApplicationCspMiddleware(EMBEDDED_APPLICATIONS));",
    );
    const trpcIndex = source.indexOf('app.use(\n    "/api/trpc"');

    expect(middlewareIndex).toBeGreaterThan(-1);
    expect(trpcIndex).toBeGreaterThan(-1);
    expect(middlewareIndex).toBeLessThan(trpcIndex);
  });
});
