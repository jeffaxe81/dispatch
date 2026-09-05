import { mergeRouters, router } from "./_core/trpc";
import { createDispatchRouter } from "./dispatchRouter";
import { dispatchRouterDependencies } from "./dispatchRuntime";
import { appRouter } from "./routers";
import { createWorkShiftAdjustmentsRouter } from "./workShiftAdjustmentsRouter";
import { workShiftAdjustmentsRouterDependencies } from "./workShiftAdjustmentsRuntime";
import { createWorkShiftReportsRouter } from "./workShiftReportsRouter";
import { workShiftReportsRouterDependencies } from "./workShiftReportsRuntime";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

const workShiftAdjustmentsRoot = router({
  workShiftAdjustments: createWorkShiftAdjustmentsRouter(workShiftAdjustmentsRouterDependencies),
});

const workShiftReportsRoot = router({
  workShiftReports: createWorkShiftReportsRouter(workShiftReportsRouterDependencies),
});

const dispatchRoot = router({
  dispatch: createDispatchRouter(dispatchRouterDependencies),
});

export const rootRouter = mergeRouters(
  appRouter,
  workShiftSchedulesRoot,
  workShiftAdjustmentsRoot,
  workShiftReportsRoot,
  dispatchRoot,
);
export type RootRouter = typeof rootRouter;
