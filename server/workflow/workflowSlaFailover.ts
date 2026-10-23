import type { SlaFailoverStore } from "./workflowSlaHeartbeatMySql";
import type { SlaHeartbeatComponent } from "./workflowSlaSignedHeartbeat";

type Environment = Record<string, string | undefined>;

export type SlaFailoverAuthorizedSources = {
  expectedSourceId: string;
  nextSourceId: string;
};

export function slaManualFailoverAllowed(env: Environment): boolean {
  return env.NODE_ENV !== "production" &&
    env.AXE_RUNTIME_ENV === "homologation" &&
    env.AXE_SLA_FAILOVER_ENABLED === "true";
}

function validSource(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
}

function utcMs(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Transferência SLA não autorizada.");
  }
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < 0 ||
    new Date(ms).toISOString() !== value) {
    throw new Error("Transferência SLA não autorizada.");
  }
  return ms;
}

/**
 * Manual, single-operation composition only. No public endpoint or scheduler.
 *
 * A future caller MUST separately authenticate/authorize the operator and
 * record the approval; operatorApproved is not a substitute for RBAC.
 * Both sources must be resolved by a trusted server-side approval registry,
 * never by a field supplied to the supervisor client.
 */
export function createSlaManualFailover(deps: {
  store: SlaFailoverStore;
  environment: Environment;
  approvedSources(input: {
    organizationId: number;
    component: SlaHeartbeatComponent;
  }): Promise<SlaFailoverAuthorizedSources | null>;
}) {
  return {
    async transfer(input: {
      organizationId: number;
      component: SlaHeartbeatComponent;
      now: string;
      operatorApproved: boolean;
    }): Promise<{ status: "fenced"; organizationId: number; component: SlaHeartbeatComponent }> {
      // Deny before DB or policy lookup when outside controlled homologation.
      if (!slaManualFailoverAllowed(deps.environment) ||
        input.operatorApproved !== true ||
        !Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component)) {
        throw new Error("Transferência SLA não autorizada.");
      }
      const nowMs = utcMs(input.now);
      let sources: SlaFailoverAuthorizedSources | null;
      try {
        sources = await deps.approvedSources({
          organizationId: input.organizationId, component: input.component,
        });
      } catch {
        throw new Error("Transferência SLA não autorizada.");
      }
      if (!sources || !validSource(sources.expectedSourceId) ||
        !validSource(sources.nextSourceId) ||
        sources.expectedSourceId === sources.nextSourceId) {
        throw new Error("Transferência SLA não autorizada.");
      }
      let promoted = false;
      try {
        promoted = await deps.store.promote({
          organizationId: input.organizationId, component: input.component,
          expectedSourceId: sources.expectedSourceId,
          nextSourceId: sources.nextSourceId, nowMs,
        });
      } catch {
        // The DB may include credentials or internal topology in its errors.
        throw new Error("Transferência SLA não autorizada.");
      }
      if (!promoted) throw new Error("Transferência SLA rejeitada por fencing.");
      // Do not leak source IDs or issue any synthetic health evidence.
      return {
        status: "fenced", organizationId: input.organizationId,
        component: input.component,
      };
    },
  };
}
