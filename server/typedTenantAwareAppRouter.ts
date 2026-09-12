import { z } from "zod";
import { assertPermission } from "./accessControl";
import { mergeRouters, protectedProcedure, router } from "./_core/trpc";
import { appRouter } from "./routers";
import { tenantAwareAppRouter as runtimeTenantAwareAppRouter } from "./tenantAwareAppRouter";
import { confirmExternalIncidentReviewForTenant } from "./tenantExternalReview";
import { getTenantSelection, requireActiveTenant } from "./tenantOperational";

// Build only the static type shape here. The runtime server continues to use
// tenantAwareAppRouter, which replaces selected operational procedures with
// tenant-scoped implementations while preserving their public signatures.
const tenantSelectionTypeRoot = router({
  tenant: router({
    selection: protectedProcedure.query(({ ctx }) => getTenantSelection(ctx.user, ctx.req)),
  }),
});

const externalTenantOverrides = router({
  integrations: router({
    externalReviews: router({
      confirm: protectedProcedure
        .input(z.object({ reviewId: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
          await assertPermission(ctx.user, "occurrences.create");
          const tenantId = await requireActiveTenant(ctx.user, ctx.req);
          return confirmExternalIncidentReviewForTenant({
            tenantId,
            reviewId: input.reviewId,
            actorUserId: ctx.user.id,
          });
        }),
    }),
  }),
});

function nestedRecordFromProcedures(procedures: Record<string, unknown>) {
  const record: Record<string, unknown> = {};
  for (const [path, procedure] of Object.entries(procedures)) {
    const parts = path.split(".");
    let cursor: Record<string, unknown> = record;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const existing = cursor[part];
      if (!existing || typeof existing !== "object") cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts.at(-1)!] = procedure;
  }
  return record;
}

const runtimeProcedures = (runtimeTenantAwareAppRouter as any)._def.procedures as Record<string, unknown>;
const externalOverrideProcedures = (externalTenantOverrides as any)._def.procedures as Record<string, unknown>;
const runtimeRouter = router(nestedRecordFromProcedures({ ...runtimeProcedures, ...externalOverrideProcedures }) as any);
const typedShapeRouter = mergeRouters(appRouter, tenantSelectionTypeRoot);

export const typedTenantAwareAppRouter = runtimeRouter as unknown as typeof typedShapeRouter;
