import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const integrationRoot = path.join(root, "shared", "inventoryIntegration");
const boundaryDocPath = path.join(root, "docs", "architecture", "inventory-assets-boundary.md");

function collectFiles(dir: string, predicate: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full, predicate);
    return predicate(full) ? [full] : [];
  });
}

const relative = (file: string) => path.relative(root, file).replaceAll(path.sep, "/");

describe("M0 inventory architecture boundary", () => {
  it("keeps the integration contract explicit and persistence-free", () => {
    const contractPath = path.join(integrationRoot, "v1.ts");
    expect(fs.existsSync(contractPath)).toBe(true);

    const contractFiles = collectFiles(integrationRoot, file => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    expect(contractFiles.length).toBeGreaterThan(0);

    const forbiddenImports = /(?:from\s+|import\s*\()["'][^"']*(?:drizzle|server\/db|mysql2|\/db(?:\/|$)|\/schema(?:\/|$)|\/repository(?:\/|$)|\/persistence(?:\/|$))/;
    const offenders = contractFiles
      .filter(file => forbiddenImports.test(fs.readFileSync(file, "utf8")))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it("does not add a direct Inventory database connection to Dispatch runtime", () => {
    const runtimeFiles = [
      ...collectFiles(path.join(root, "server"), file => file.endsWith(".ts") && !file.endsWith(".test.ts")),
      ...collectFiles(path.join(root, "shared"), file => file.endsWith(".ts") && !file.endsWith(".test.ts")),
    ];
    const forbiddenSignals = /\b(?:INVENTORY_DATABASE_URL|ASSET_INVENTORY_DATABASE_URL|inventoryDb|assetInventoryDb)\b/;
    const offenders = runtimeFiles
      .filter(file => forbiddenSignals.test(fs.readFileSync(file, "utf8")))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it("keeps Inventory-owned tables out of the Dispatch schema and migrations", () => {
    const persistenceFiles = [
      path.join(root, "drizzle", "schema.ts"),
      ...collectFiles(path.join(root, "drizzle"), file => /^\d{4}_.+\.sql$/.test(path.basename(file))),
    ];
    const inventoryOwnedTable = /(?:asset_inventory_[a-z0-9_]+|inventory_asset_[a-z0-9_]+)/i;
    const offenders = persistenceFiles
      .filter(file => inventoryOwnedTable.test(fs.readFileSync(file, "utf8")))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it("documents REST/event ownership, fail-closed security, observability and rollback", () => {
    expect(fs.existsSync(boundaryDocPath)).toBe(true);
    const doc = fs.readFileSync(boundaryDocPath, "utf8");

    for (const required of [
      "REST versionado",
      "eventos versionados",
      "tenant",
      "correlação",
      "idempotência",
      "fail-closed",
      "sem SQL cruzado",
      "Observabilidade",
      "Rollback",
      "nenhuma migration",
    ]) {
      expect(doc).toContain(required);
    }
  });
});
