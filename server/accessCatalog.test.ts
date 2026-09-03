import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { accessPermissions, accessRoles, rolePermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_ACCESS_PERMISSIONS, DEFAULT_ACCESS_ROLES, ensureDefaultAccessCatalog, listAccessPermissionGlossary } from "./accessCatalog";
import { defaultProfileEntries } from "../client/src/pages/ManualsHelpPage";

// Pure data check — doesn't touch the database, so it isn't gated behind
// the DB requirement below. client/src/pages/ManualsHelpPage.tsx duplicates
// the 5 default profiles' name/description for its own bundle; this guards
// against the two lists silently drifting apart.
describe("consistência entre o catálogo padrão e o glossário exibido em Manuais e Ajuda", () => {
  it("expõe os mesmos 5 códigos de perfil, na mesma ordem", () => {
    expect(defaultProfileEntries.map(profile => profile.code)).toEqual(DEFAULT_ACCESS_ROLES.map(role => role.code));
  });

  it("mantém nome e descrição idênticos aos do catálogo padrão", () => {
    for (const role of DEFAULT_ACCESS_ROLES) {
      const clientEntry = defaultProfileEntries.find(profile => profile.code === role.code);
      expect(clientEntry?.name).toBe(role.name);
      expect(clientEntry?.description).toBe(role.description);
    }
  });
});

describe("catálogo padrão de acesso", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para teste integrado.");
  });

  it("cria os 5 perfis padrão protegidos com a matriz de permissões esperada", async () => {
    await ensureDefaultAccessCatalog();
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível.");

    for (const role of DEFAULT_ACCESS_ROLES) {
      const row = (await db.select().from(accessRoles).where(eq(accessRoles.code, role.code)).limit(1))[0];
      expect(row, `perfil ${role.code} deveria existir`).toBeDefined();
      expect(row?.isSystem).toBe(true);

      const grants = await db.select({ code: accessPermissions.code }).from(rolePermissions).innerJoin(accessPermissions, eq(accessPermissions.id, rolePermissions.permissionId)).where(eq(rolePermissions.roleId, row!.id));
      expect(new Set(grants.map(grant => grant.code))).toEqual(new Set(role.permissionCodes));
    }
  });

  it('inclui "agente_campo", exigido por server/db.ts para atribuir o perfil operacional Agente de Campo', () => {
    expect(DEFAULT_ACCESS_ROLES.some(role => role.code === "agente_campo")).toBe(true);
  });

  it("é idempotente: rodar novamente não duplica permissões nem vínculos", async () => {
    await ensureDefaultAccessCatalog();
    await ensureDefaultAccessCatalog();
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível.");

    for (const permission of DEFAULT_ACCESS_PERMISSIONS) {
      const rows = await db.select({ id: accessPermissions.id }).from(accessPermissions).where(eq(accessPermissions.code, permission.code));
      expect(rows, `permissão ${permission.code} não deveria estar duplicada`).toHaveLength(1);
    }
    for (const role of DEFAULT_ACCESS_ROLES) {
      const rows = await db.select({ id: accessRoles.id }).from(accessRoles).where(eq(accessRoles.code, role.code));
      expect(rows, `perfil ${role.code} não deveria estar duplicado`).toHaveLength(1);
    }
  });

  it("expõe o glossário de permissões para qualquer usuário autenticado, com descrição", async () => {
    const glossary = await listAccessPermissionGlossary();
    expect(glossary.length).toBeGreaterThanOrEqual(DEFAULT_ACCESS_PERMISSIONS.length);
    const occurrencesView = glossary.find(entry => entry.code === "occurrences.view");
    expect(occurrencesView?.description).toMatch(/ocorrências/i);
  });
});
