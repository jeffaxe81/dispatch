import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

describe("classificação das suítes de teste", () => {
  it("mantém comandos explícitos para testes locais e de integração", () => {
    expect(manifest.scripts.test).toBe(
      "vitest run --config vitest.config.ts",
    );
    expect(manifest.scripts["test:unit"]).toBe(
      "vitest run --config vitest.config.ts",
    );
    expect(manifest.scripts["test:integration"]).toBe(
      "vitest run --config vitest.integration.config.ts",
    );
    expect(manifest.scripts["test:all"]).toBe(
      "vitest run --config vitest.config.ts && vitest run --config vitest.integration.config.ts",
    );
  });

  it("classifica o bootstrap administrativo como integração", () => {
    expect(
      fs.existsSync(
        path.join(root, "server/localAuth.bootstrap.integration.test.ts"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, "server/localAuth.bootstrap.test.ts")),
    ).toBe(false);
  });
});
