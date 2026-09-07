import { and, eq } from "drizzle-orm";
import type { WorkspaceLayout, WorkspaceLayoutV2 } from "@shared/workspaceLayout";
import { workspaceLayouts } from "../../drizzle/workspaceLayoutSchema";
import { getDb } from "../db";

export type PersistedWorkspaceLayout = WorkspaceLayout | WorkspaceLayoutV2;

type WorkspaceDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type WorkspaceDatabaseProvider = () => Promise<WorkspaceDatabase | null>;

export interface WorkspaceLayoutRepository {
  findOwn(tenantId: number, userId: number, name: string): Promise<PersistedWorkspaceLayout | null>;
  saveOwn(tenantId: number, userId: number, name: string, layout: PersistedWorkspaceLayout): Promise<void>;
  resetOwn(tenantId: number, userId: number, name: string): Promise<void>;
}

function scopeKey(tenantId: number, userId: number, name: string) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("WORKSPACE_TENANT_INVALID");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("WORKSPACE_USER_INVALID");
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("WORKSPACE_NAME_INVALID");
  return `${tenantId}:${userId}:${normalizedName}`;
}

function validateScope(tenantId: number, userId: number, name: string) {
  scopeKey(tenantId, userId, name);
  return name.trim();
}

export class InMemoryWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  private readonly records = new Map<string, PersistedWorkspaceLayout>();

  async findOwn(tenantId: number, userId: number, name: string): Promise<PersistedWorkspaceLayout | null> {
    return this.records.get(scopeKey(tenantId, userId, name)) ?? null;
  }

  async saveOwn(tenantId: number, userId: number, name: string, layout: PersistedWorkspaceLayout): Promise<void> {
    this.records.set(scopeKey(tenantId, userId, name), structuredClone(layout));
  }

  async resetOwn(tenantId: number, userId: number, name: string): Promise<void> {
    this.records.delete(scopeKey(tenantId, userId, name));
  }
}

export class DrizzleWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  constructor(private readonly databaseProvider: WorkspaceDatabaseProvider = getDb) {}

  private async database(): Promise<WorkspaceDatabase> {
    const db = await this.databaseProvider();
    if (!db) throw new Error("Banco de dados indisponível para persistência do workspace.");
    return db;
  }

  async findOwn(tenantId: number, userId: number, name: string): Promise<PersistedWorkspaceLayout | null> {
    const normalizedName = validateScope(tenantId, userId, name);
    const db = await this.database();
    const row = (await db
      .select({ layoutJson: workspaceLayouts.layoutJson })
      .from(workspaceLayouts)
      .where(and(
        eq(workspaceLayouts.tenantId, tenantId),
        eq(workspaceLayouts.userId, userId),
        eq(workspaceLayouts.name, normalizedName),
      ))
      .limit(1))[0];
    return row?.layoutJson ?? null;
  }

  async saveOwn(tenantId: number, userId: number, name: string, layout: PersistedWorkspaceLayout): Promise<void> {
    const normalizedName = validateScope(tenantId, userId, name);
    const db = await this.database();
    await db
      .insert(workspaceLayouts)
      .values({
        tenantId,
        userId,
        name: normalizedName,
        layoutVersion: layout.version,
        layoutJson: layout,
      })
      .onDuplicateKeyUpdate({
        set: {
          layoutVersion: layout.version,
          layoutJson: layout,
        },
      });
  }

  async resetOwn(tenantId: number, userId: number, name: string): Promise<void> {
    const normalizedName = validateScope(tenantId, userId, name);
    const db = await this.database();
    await db
      .delete(workspaceLayouts)
      .where(and(
        eq(workspaceLayouts.tenantId, tenantId),
        eq(workspaceLayouts.userId, userId),
        eq(workspaceLayouts.name, normalizedName),
      ));
  }
}
