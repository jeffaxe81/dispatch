import { router } from "./_core/trpc";
import { appRouter } from "./routers";
import { workShiftRouter } from "./workShiftRouter";

export const rootRouter = router({
  ...appRouter._def.record,
  workShift: workShiftRouter,
});

export type RootRouter = typeof rootRouter;
