import { mergeRouters, router } from "./_core/trpc";
import { createDispatchRouter } from "./dispatchRouter";
import { dispatchRouterDependencies } from "./dispatchRuntime";
import { appRouter } from "./routers";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

const dispatchRoot = router({
  dispatch: createDispatchRouter(dispatchRouterDependencies),
});

export const rootRouter = mergeRouters(appRouter, workShiftSchedulesRoot, dispatchRoot);
export type RootRouter = typeof rootRouter;
