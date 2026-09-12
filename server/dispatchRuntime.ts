import { getDb } from "./db";
import { createDispatchEligibilityDbDependencies } from "./dispatchEligibilityDb";
import { createDispatchEligibilityRuntime } from "./dispatchEligibilityRuntime";
import type { DispatchRouterDependencies } from "./dispatchRouter";
import { OsrmRouteProvider } from "./routingProvider";
import { assertTeamTenant, requireActiveTenant } from "./tenantOperational";

const routeProvider = new OsrmRouteProvider();

export const dispatchRouterDependencies: DispatchRouterDependencies = {
  now: () => new Date(),
  routeProvider,
  resolveActiveTenant: requireActiveTenant,
  assertTeamTenant,
  async evaluateCandidates(candidates, instant) {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível.");

    const runtime = createDispatchEligibilityRuntime(
      createDispatchEligibilityDbDependencies(db as never),
    );
    return runtime.evaluateCandidates(candidates, instant);
  },
};
