import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const dockerfile = readFileSync("Dockerfile", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const serverEntry = readFileSync("server/_core/index.ts", "utf8");

describe("Docker production startup contract", () => {
  it("separates migration generation from a diagnostic production migrator", () => {
    expect(packageJson.scripts["db:generate"]).toBe("drizzle-kit generate");
    expect(packageJson.scripts["db:migrate"]).toBe("node scripts/migrate-production.mjs");
    expect(existsSync("scripts/migrate-production.mjs")).toBe(true);
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

  it("keeps the Vite development graph out of the production bundle", () => {
    expect(serverEntry).not.toContain('import { serveStatic, setupVite } from "./vite"');
    expect(serverEntry).not.toContain('await import("./vite")');
    expect(serverEntry).toContain('const viteModulePath = "./vite"');
    expect(serverEntry).toContain("await import(viteModulePath)");
    expect(serverEntry).toContain('import { serveStatic } from "./static"');
  });
});
