import {
  normalizeWorkspaceLayoutV2,
  type WorkspaceLayoutV2,
  type WorkspaceWidgetType,
} from "@shared/workspaceLayout";
import type { WorkspaceLayoutRepository } from "./workspaceLayoutRepository";

export type WorkspaceAccessContext = {
  tenantId: number;
  userId: number;
  allowedWidgetTypes: ReadonlySet<WorkspaceWidgetType>;
};

export const DEFAULT_OPERATIONAL_WORKSPACE: WorkspaceLayoutV2 = {
  id: "workspace:operational-default",
  name: "default",
  version: 2,
  screens: [
    {
      screenId: "primary",
      name: "Principal",
      order: 0,
      mode: "primary",
      widgets: [
        { instanceId: "metrics-1", type: "metrics", x: 0, y: 0, w: 12, h: 2, settings: {} },
        { instanceId: "map-1", type: "operational-map", x: 0, y: 2, w: 8, h: 6, settings: {} },
        { instanceId: "priority-1", type: "priority-queue", x: 8, y: 2, w: 4, h: 6, settings: {} },
        { instanceId: "incidents-1", type: "incidents", x: 0, y: 8, w: 6, h: 4, settings: {} },
        { instanceId: "teams-1", type: "teams", x: 6, y: 8, w: 3, h: 4, settings: {} },
        { instanceId: "work-shift-1", type: "work-shift", x: 9, y: 8, w: 3, h: 4, settings: {} },
      ],
    },
  ],
};

function safeDefault(context: WorkspaceAccessContext): WorkspaceLayoutV2 {
  return normalizeWorkspaceLayoutV2(DEFAULT_OPERATIONAL_WORKSPACE, context.allowedWidgetTypes);
}

export class WorkspaceLayoutService {
  constructor(private readonly repository: WorkspaceLayoutRepository) {}

  async getOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayoutV2> {
    try {
      const persisted = await this.repository.findOwn(context.tenantId, context.userId, name);
      if (!persisted) return safeDefault(context);
      return normalizeWorkspaceLayoutV2(persisted, context.allowedWidgetTypes);
    } catch {
      return safeDefault(context);
    }
  }

  async saveOwnWorkspace(context: WorkspaceAccessContext, name: string, input: unknown): Promise<WorkspaceLayoutV2> {
    const normalized = normalizeWorkspaceLayoutV2(input, context.allowedWidgetTypes);
    await this.repository.saveOwn(context.tenantId, context.userId, name, normalized);
    return normalized;
  }

  async resetOwnWorkspace(context: WorkspaceAccessContext, name: string): Promise<WorkspaceLayoutV2> {
    await this.repository.resetOwn(context.tenantId, context.userId, name);
    return safeDefault(context);
  }
}
