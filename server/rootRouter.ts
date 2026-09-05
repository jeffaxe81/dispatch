import { mergeRouters, router } from "./_core/trpc";
import { createDispatchRouter } from "./dispatchRouter";
import { dispatchRouterDependencies } from "./dispatchRuntime";
import { appRouter } from "./routers";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";
import { createWorkShiftOperationsRouter } from "./workShiftOperationsRouter";
import { workShiftOperationsRouterDependencies } from "./workShiftOperationsRuntime";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

const dispatchRoot = router({
  dispatch: createDispatchRouter(dispatchRouterDependencies),
});

const workShiftOperationsRoot = router({
  workShiftOperations: createWorkShiftOperationsRouter(workShiftOperationsRouterDependencies),
});

export const rootRouter = mergeRouters(appRouter, workShiftSchedulesRoot, dispatchRoot, workShiftOperationsRoot);
export type RootRouter = typeof rootRouter;
