import { eq } from "drizzle-orm";
import { teams } from "../../drizzle/schema";
import { getDb } from "../db";
import { createFormTenantStore } from "./formTenantStore";

type DbProvider = { getDb: typeof getDb };

export function createFormTenantDbAdapter(provider: DbProvider = { getDb }) {
  return {
    async findTeamById(teamId: number) {
      const db = await provider.getDb();
      if (!db) throw new Error("Banco de dados indisponível para resolver tenant de formulários.");
      const rows = await db
        .select({ id: teams.id, organizationId: teams.organizationId })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

export function createDefaultFormTenantStore() {
  return createFormTenantStore(createFormTenantDbAdapter());
}
