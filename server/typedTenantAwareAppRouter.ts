import { mergeRouters, protectedProcedure, router } from "./_core/trpc";
import { appRouter } from "./routers";
import { tenantAwareAppRouter as runtimeTenantAwareAppRouter } from "./tenantAwareAppRouter";
import { getTenantSelection } from "./tenantOperational";

// Build only the static type shape here. The runtime server continues to use
// tenantAwareAppRouter, which replaces selected operational procedures with
// tenant-scoped implementations while preserving their public signatures.
const tenantSelectionTypeRoot = router({
  tenant: router({
    selection: protectedProcedure.query(({ ctx }) => getTenantSelection(ctx.user, ctx.req)),
  }),
});

const typedShapeRouter = mergeRouters(appRouter, tenantSelectionTypeRoot);

export const typedTenantAwareAppRouter = runtimeTenantAwareAppRouter as unknown as typeof typedShapeRouter;
