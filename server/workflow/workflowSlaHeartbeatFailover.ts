import { SLA_HEARTBEAT_MAX_AGE_MS, type SlaHeartbeatComponent } from "./workflowSlaSignedHeartbeat";

export type SlaHeartbeatFailoverReason = "source_lost" | "planned_maintenance";

export type SlaHeartbeatHandover = {
  organizationId: number;
  component: SlaHeartbeatComponent;
  actorUserId: number;
  expectedSourceId: string;
  nextSourceId: string;
  expectedSequence: number;
  nowMs: number;
  reason: SlaHeartbeatFailoverReason;
};

export type SlaHeartbeatHandoverStore = {
  /** Must perform compare+swap and audit INSERT in ONE database transaction. */
  handover(input: SlaHeartbeatHandover): Promise<boolean>;
};

type Request = Omit<SlaHeartbeatHandover, "nowMs"> & {
  now: string;
  operatorApproved: boolean;
};

function strictUtc(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Solicitação de failover SLA inválida.");
  }
  const nowMs = Date.parse(value);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
    new Date(nowMs).toISOString() !== value) {
    throw new Error("Solicitação de failover SLA inválida.");
  }
  return nowMs;
}

function validSource(value: string): boolean {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);
}

export function slaHeartbeatFailoverAllowed(environment: Record<string, string | undefined>): boolean {
  return environment.NODE_ENV !== "production" &&
    environment.AXE_RUNTIME_ENV === "homologation" &&
    environment.AXE_SLA_HEARTBEAT_FAILOVER_ENABLED === "true";
}

export function validateSlaHeartbeatHandover(input: SlaHeartbeatHandover): void {
  if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
    !["scheduler", "adapter"].includes(input.component) ||
    !Number.isSafeInteger(input.actorUserId) || input.actorUserId < 1 ||
    !Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 1 ||
    input.expectedSequence >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(input.nowMs) || input.nowMs < 0 ||
    !validSource(input.expectedSourceId) ||
    !validSource(input.nextSourceId) ||
    input.expectedSourceId === input.nextSourceId ||
    !["source_lost", "planned_maintenance"].includes(input.reason)) {
    throw new Error("Solicitação de failover SLA inválida.");
  }
}

/**
 * J6F manual takeover. No HTTP endpoint, timer, worker, scheduler, restart,
 * delivery or automatic source promotion is introduced.
 *
 * Auth callback is mandatory; the boolean alone is not authorization.
 * The physical store validates old source+sequence, STALE elapsed time and
 * atomically moves ownership into an unhealthy state with an audit record.
 */
export function createSlaHeartbeatManualFailover(deps: {
  store: SlaHeartbeatHandoverStore;
  environment: Record<string, string | undefined>;
  authorize(input: {
    organizationId: number;
    actorUserId: number;
    component: SlaHeartbeatComponent;
  }): Promise<boolean>;
}) {
  return {
    async handover(input: Request): Promise<void> {
      if (!slaHeartbeatFailoverAllowed(deps.environment)) {
        throw new Error("Failover SLA desabilitado.");
      }
      const { now, operatorApproved, ...params } = input;
      const command: SlaHeartbeatHandover = { ...params, nowMs: strictUtc(now) };
      validateSlaHeartbeatHandover(command);
      if (operatorApproved !== true) {
        throw new Error("Failover SLA sem aprovação registrada.");
      }
      let approved = false;
      try {
        approved = await deps.authorize({
          organizationId: command.organizationId,
          actorUserId: command.actorUserId,
          component: command.component,
        });
      } catch {
        // Do not leak the internal authorization provider's error.
      }
      if (approved !== true) {
        throw new Error("Failover SLA sem autorização.");
      }
      let committed = false;
      try {
        committed = await deps.store.handover(command);
      } catch {
        throw new Error("Failover SLA rejeitado.");
      }
      if (!committed) throw new Error("Failover SLA rejeitado.");
    },
  };
}

export function isSlaHeartbeatExpired(
  sentAtMs: number,
  nowMs: number,
): boolean {
  return Number.isSafeInteger(sentAtMs) && sentAtMs >= 0 &&
    Number.isSafeInteger(nowMs) && nowMs >= sentAtMs &&
    nowMs - sentAtMs > SLA_HEARTBEAT_MAX_AGE_MS;
}
