import type { User } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { assertSuperAdministrator } from "../accessControl";
import { getDb } from "../dbLegacy";
import { listAuthorizedTenants } from "../tenantOperational";
import { createSlaManualFailover, slaManualFailoverAllowed } from "./workflowSlaFailover";
import type { SlaFailoverStore } from "./workflowSlaHeartbeatMySql";
import { createSlaHeartbeatMySqlStore } from "./workflowSlaHeartbeatMySql";
import {
  verifySlaFailoverApproval, type SlaFailoverApproval,
} from "./workflowSlaFailoverApproval";
import type { SlaHeartbeatComponent } from "./workflowSlaSignedHeartbeat";

type Actor = Pick<User, "id" | "openId" | "role" | "operationalRole" | "teamId" | "active">;
type Environment = Record<string, string | undefined>;
const refused = () => new Error("Transferência SLA não autorizada.");

const environmentSources: Record<SlaHeartbeatComponent, {
  expected: string; next: string;
}> = {
  scheduler: {
    expected: "AXE_SLA_FAILOVER_EXPECTED_SOURCE_SCHEDULER",
    next: "AXE_SLA_FAILOVER_NEXT_SOURCE_SCHEDULER",
  },
  adapter: {
    expected: "AXE_SLA_FAILOVER_EXPECTED_SOURCE_ADAPTER",
    next: "AXE_SLA_FAILOVER_NEXT_SOURCE_ADAPTER",
  },
};

/**
 * Explicit, unauthenticated-transport-free composition. An HTTP endpoint
 * MUST NOT call this with a client-fabricated actor; actor is an already
 * authenticated server session. In production the gate always denies.
 */
export function createSlaAuditedFailoverCoordinator(deps: {
  environment: Environment;
  clock(): string;
  approvalSecret: string | Buffer;
  authorizeOperator(actor: Actor): Promise<void>;
  authorizeTenant(actor: Actor, organizationId: number): Promise<void>;
  authorizeApprover(approverUserId: number, organizationId: number): Promise<void>;
  approvedSources(input: { organizationId: number; component: SlaHeartbeatComponent }):
    Promise<{ expectedSourceId: string; nextSourceId: string } | null>;
  openStore(): Promise<SlaFailoverStore>;
}) {
  return {
    async transfer(input: {
      actor: Actor;
      organizationId: number;
      component: SlaHeartbeatComponent;
      operatorApproved: boolean;
      approval: SlaFailoverApproval;
    }): Promise<{ status: "fenced"; organizationId: number; component: SlaHeartbeatComponent }> {
      if (!slaManualFailoverAllowed(deps.environment) ||
        !input.actor?.active ||
        !Number.isSafeInteger(input.actor.id) || input.actor.id < 1 ||
        input.operatorApproved !== true ||
        !Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component)) throw refused();

      let approvalRef: string;
      let approverUserId: number;
      let now: string;
      let sources: { expectedSourceId: string; nextSourceId: string };
      try {
        now = deps.clock();
        await deps.authorizeOperator(input.actor);
        await deps.authorizeTenant(input.actor, input.organizationId);
        const resolvedSources = await deps.approvedSources({
          organizationId: input.organizationId,
          component: input.component,
        });
        if (!resolvedSources) throw refused();
        sources = resolvedSources;
        const checked = verifySlaFailoverApproval({
          approval: input.approval,
          operatorUserId: input.actor.id,
          organizationId: input.organizationId,
          component: input.component,
          expectedSourceId: sources.expectedSourceId,
          nextSourceId: sources.nextSourceId,
          now,
          secret: deps.approvalSecret,
        });
        ({ approvalRef, approverUserId } = checked);
        await deps.authorizeApprover(approverUserId, input.organizationId);
      } catch {
        throw refused();
      }

      let store: SlaFailoverStore;
      try {
        store = await deps.openStore();
      } catch {
        throw refused();
      }
      return createSlaManualFailover({
        store,
        environment: deps.environment,
        clock: () => now,
        audit: { actorUserId: input.actor.id, approverUserId, approvalRef },
        // Reuse the exact server-side source pair that was cryptographically
        // verified; never resolve a second, potentially drifted pair later.
        approvedSources: async () => sources,
      }).transfer({
        organizationId: input.organizationId,
        component: input.component,
        operatorApproved: true,
      });
    },
  };
}

/**
 * Not invoked by startup, timers, HTTP, tRPC or background workers.
 * Requires authenticated user context and a separately issued/approved token.
 * Does not create approvals or issue grants.
 */
export async function runSlaAuditedFailoverHomologation(input: {
  actor: Actor;
  organizationId: number;
  component: SlaHeartbeatComponent;
  operatorApproved: boolean;
  approval: SlaFailoverApproval;
}) {
  const env = process.env;
  if (!slaManualFailoverAllowed(env)) throw refused();
  return createSlaAuditedFailoverCoordinator({
    environment: env,
    clock: () => new Date().toISOString(),
    approvalSecret: env.AXE_SLA_FAILOVER_APPROVAL_SECRET ?? "",
    authorizeOperator: async actor => {
      await assertSuperAdministrator(actor);
    },
    authorizeTenant: async (actor, organizationId) => {
      const authorized = await listAuthorizedTenants(actor);
      if (!authorized.some(tenant => tenant.id === organizationId)) throw refused();
    },
    authorizeApprover: async (userId, organizationId) => {
      const db = await getDb();
      if (!db) throw refused();
      const approver = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
      if (!approver?.active) throw refused();
      await assertSuperAdministrator(approver);
      const allowed = await listAuthorizedTenants(approver);
      if (!allowed.some(tenant => tenant.id === organizationId)) throw refused();
    },
    approvedSources: async ({ organizationId, component }) => {
      if (Number(env.AXE_SLA_FAILOVER_TENANT_ID) !== organizationId) return null;
      const keys = environmentSources[component];
      return {
        expectedSourceId: env[keys.expected] ?? "",
        nextSourceId: env[keys.next] ?? "",
      };
    },
    openStore: async () => {
      const db = await getDb();
      if (!db) throw refused();
      return createSlaHeartbeatMySqlStore(db);
    },
  }).transfer(input);
}
