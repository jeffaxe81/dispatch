import { mergeRouters, router } from "./_core/trpc";
import { createDispatchRouter } from "./dispatchRouter";
import { dispatchRouterDependencies } from "./dispatchRuntime";
import { createFormsTrpcRouter } from "./forms/formsTrpcRouter";
import { formsRuntimeContextFactory } from "./forms/formsRuntimeContext";
import { appRouter } from "./routers";
import { createWorkspaceRouter } from "./routers/workspace";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";
import { createWorkShiftOperationsRouter } from "./workShiftOperationsRouter";
import { workShiftOperationsRouterDependencies } from "./workShiftOperationsRuntime";
import { workspaceRouterDependencies } from "./workspace/workspaceRuntime";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

const dispatchRoot = router({
  dispatch: createDispatchRouter(dispatchRouterDependencies),
});

const workShiftOperationsRoot = router({
  workShiftOperations: createWorkShiftOperationsRouter(workShiftOperationsRouterDependencies),
});

const formsRoot = router({
  forms: createFormsTrpcRouter(formsRuntimeContextFactory),
});

const workspaceRoot = router({
  workspace: createWorkspaceRouter(workspaceRouterDependencies),
});

export const rootRouter = mergeRouters(
  appRouter,
  workShiftSchedulesRoot,
  dispatchRoot,
  workShiftOperationsRoot,
  formsRoot,
  workspaceRoot,
);
export type RootRouter = typeof rootRouter;
