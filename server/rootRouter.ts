import { cp016Router } from "./cp016Router";
import { appRouter } from "./routers";
import { mergeRouters, router } from "./_core/trpc";

const cp016NamespaceRouter = router({
  cp016: cp016Router,
});

export const rootRouter = mergeRouters(appRouter, cp016NamespaceRouter);
export type RootRouter = typeof rootRouter;
