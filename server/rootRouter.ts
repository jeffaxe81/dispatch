import { mergeRouters, router } from "./_core/trpc";
import { appRouter } from "./routers";
import { createWorkShiftSchedulesRouter } from "./workShiftSchedulesRouter";
import { workShiftSchedulesRouterDependencies } from "./workShiftSchedulesRuntime";
import { createDispatchRouter } from "./dispatchRouter";
import { createDispatchEligibilityRuntime } from "./dispatchEligibilityRuntime";
import { createDispatchEligibilityDbDependencies } from "./dispatchEligibilityDb";
import { getDb } from "./db";
import { OsrmRouteProvider } from "./routingProvider";

const workShiftSchedulesRoot = router({
  workShiftSchedules: createWorkShiftSchedulesRouter(workShiftSchedulesRouterDependencies),
});

const dispatchRoot = router({
  dispatch: createDispatchRouter({
    now: () => new Date(),
    routeProvider: new OsrmRouteProvider(),
    async evaluateCandidates(candidates, instant) {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      return createDispatchEligibilityRuntime(
        createDispatchEligibilityDbDependencies(db),
      ).evaluateCandidates(candidates, instant);
    },
  }),
});

export const rootRouter = mergeRouters(appRouter, workShiftSchedulesRoot, dispatchRoot);
export type RootRouter = typeof rootRouter;