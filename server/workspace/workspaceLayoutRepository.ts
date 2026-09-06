import type { WorkspaceLayout } from "@shared/workspaceLayout";

export interface WorkspaceLayoutRepository {
  findOwn(tenantId: number, userId: number, name: string): Promise<WorkspaceLayout | null>;
  saveOwn(tenantId: number, userId: number, name: string, layout: WorkspaceLayout): Promise<void>;
  resetOwn(tenantId: number, userId: number, name: string): Promise<void>;
}

function scopeKey(tenantId: number, userId: number, name: string) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("WORKSPACE_TENANT_INVALID");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("WORKSPACE_USER_INVALID");
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("WORKSPACE_NAME_INVALID");
  return `${tenantId}:${userId}:${normalizedName}`;
}

export class InMemoryWorkspaceLayoutRepository implements WorkspaceLayoutRepository {
  private readonly records = new Map<string, WorkspaceLayout>();

  async findOwn(tenantId: number, userId: number, name: string): Promise<WorkspaceLayout | null> {
    return this.records.get(scopeKey(tenantId, userId, name)) ?? null;
  }

  async saveOwn(tenantId: number, userId: number, name: string, layout: WorkspaceLayout): Promise<void> {
    this.records.set(scopeKey(tenantId, userId, name), structuredClone(layout));
  }

  async resetOwn(tenantId: number, userId: number, name: string): Promise<void> {
    this.records.delete(scopeKey(tenantId, userId, name));
  }
}
