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

  it("provides a dedicated migration image target", () => {
    expect(dockerfile).toContain("FROM deps AS migrate");
    expect(dockerfile).toContain('CMD ["pnpm", "db:migrate"]');
  });

  it("blocks application startup until migrations succeed", () => {
    expect(compose).toContain("migrate:");
    expect(compose).toContain("condition: service_completed_successfully");
  });

  it("keeps the production runtime focused on application startup", () => {
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
    expect(dockerfile).not.toContain("pnpm add --global drizzle-kit");
  });

  it("installs Vite in the production runtime because the server bundle imports it", () => {
    expect(packageJson.dependencies.vite).toBeTruthy();
    expect(packageJson.devDependencies?.vite).toBeUndefined();
  });
});
