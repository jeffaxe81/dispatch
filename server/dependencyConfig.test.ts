import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const workspace = YAML.parse(fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8"));
const lockfile = YAML.parse(fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"));

describe("configuração reproduzível de dependências", () => {
  it("usa packageManager como única fonte da versão do pnpm", () => {
    expect(manifest.packageManager).toMatch(/^pnpm@10\.4\.1\+sha512\./);
    expect(manifest.devDependencies?.pnpm).toBeUndefined();
  });

  it("mantém patches e overrides do workspace sincronizados com o lockfile", () => {
    expect(lockfile.patchedDependencies ?? {}).toEqual(workspace.patchedDependencies ?? {});
    expect(lockfile.overrides ?? {}).toEqual(workspace.overrides ?? {});
  });

  it("autoriza somente o script de instalação necessário ao build", () => {
    expect(manifest.pnpm?.onlyBuiltDependencies).toEqual(["esbuild"]);
  });
});
