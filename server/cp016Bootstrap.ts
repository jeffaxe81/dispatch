import { and, eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { embeddedIntegrations } from "../drizzle/schema.cp016";
import { OPERATIONAL_ROLES } from "../shared/operations";
import { getDb } from "./db";
import { saveEmbeddedIntegration } from "./embeddedIntegrationDb";

export const NEO_DEFAULT_INTEGRATION = {
  code: "neo-interact",
  name: "NEO Interact",
  url: "https://gscprj.saas.digitro.cloud/neo/",
  enabled: true,
  displayMode: "split" as const,
  allowedRoles: [...OPERATIONAL_ROLES],
  integrationConnectionId: null,
};

type BootstrapDependencies = {
  findExisting: () => Promise<unknown | null>;
  findAdministratorId: () => Promise<number | null>;
  save: (input: typeof NEO_DEFAULT_INTEGRATION & { actorUserId: number }) => Promise<unknown>;
};

async function createDefaultDependencies(): Promise<BootstrapDependencies> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return {
    findExisting: async () =>
      (await db.select().from(embeddedIntegrations).where(eq(embeddedIntegrations.code, NEO_DEFAULT_INTEGRATION.code)).limit(1))[0] ?? null,
    findAdministratorId: async () =>
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.active, true), eq(users.operationalRole, "administrador")))
          .limit(1)
      )[0]?.id ?? null,
    save: saveEmbeddedIntegration,
  };
}

export async function ensureDefaultNeoIntegration(dependencies?: BootstrapDependencies) {
  const deps = dependencies ?? (await createDefaultDependencies());
  const existing = await deps.findExisting();
  if (existing) return existing;

  const actorUserId = await deps.findAdministratorId();
  if (!actorUserId) return null;

  return deps.save({
    ...NEO_DEFAULT_INTEGRATION,
    actorUserId,
  });
}
