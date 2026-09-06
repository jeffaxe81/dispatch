import type { WorkspaceRouterDependencies } from "../routers/workspace";
import { resolveWorkspaceAccessContext } from "./workspaceAccessContext";
import { DrizzleWorkspaceLayoutRepository } from "./workspaceLayoutRepository";
import { WorkspaceLayoutService } from "./workspaceLayoutService";

const workspaceLayoutRepository = new DrizzleWorkspaceLayoutRepository();
const workspaceLayoutService = new WorkspaceLayoutService(workspaceLayoutRepository);

export const workspaceRouterDependencies: WorkspaceRouterDependencies = {
  resolveAccessContext: resolveWorkspaceAccessContext,
  service: workspaceLayoutService,
};
