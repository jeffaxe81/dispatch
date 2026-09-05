import { mergeRouters, router } from "./_core/trpc";
import { appRouter } from "./routers";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

export const rootRouter = mergeRouters(appRouter, workShiftSchedulesRoot);
export type RootRouter = typeof rootRouter;