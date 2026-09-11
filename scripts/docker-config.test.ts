import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const dockerfile = readFileSync("Dockerfile", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");

describe("Docker production startup contract", () => {
  it("separates migration generation from applying reviewed migrations", () => {
    expect(packageJson.scripts["db:generate"]).toBe("drizzle-kit generate");
    expect(packageJson.scripts["db:migrate"]).toBe("drizzle-kit migrate");
  });

  it("keeps drizzle tooling available in the runtime image", () => {
    expect(dockerfile).toContain("drizzle-kit");
  });

  it("runs migrations before starting the application", () => {
    expect(compose).toContain("pnpm db:migrate");
    expect(compose).toContain("node dist/index.js");
  });
});
