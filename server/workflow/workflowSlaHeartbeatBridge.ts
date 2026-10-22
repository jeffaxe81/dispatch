import type { ScopedSlaProbeEvidence } from "./workflowSlaDiagnosticPreview";
import {
  createSlaHeartbeatService,
  signSlaHeartbeat,
  slaHeartbeatIngestAllowed,
  SLA_HEARTBEAT_MAX_AGE_MS,
  type SlaHeartbeatComponent,
  type SlaHeartbeatSigner,
  type SlaHeartbeatState,
  type SlaHeartbeatStore,
} from "./workflowSlaSignedHeartbeat";

type Scope = { organizationId: number; component: SlaHeartbeatComponent; now: string };
type Environment = Record<string, string | undefined>;

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

function validSource(sourceId: unknown): sourceId is string {
  return typeof sourceId === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,79}$/.test(sourceId);
}

function instant(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Instante SLA inválido.");
  }
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < 0 ||
    new Date(ms).toISOString() !== value) {
    throw new Error("Instante SLA inválido.");
  }
  return ms;
}

/**
 * Reads accepted evidence only for the authorized source for each tenant.
 * An old heartbeat from another source (e.g. after key/source rotation)
 * NEVER inherits the new source's authorization.
 */
export function slaHeartbeatReadAllowed(environment: Environment): boolean {
  return environment.NODE_ENV !== "production" &&
    environment.AXE_RUNTIME_ENV === "homologation" &&
    environment.AXE_SLA_READINESS_PREVIEW_ENABLED === "true" &&
    environment.AXE_SLA_HEARTBEAT_READ_ENABLED === "true";
}

export function createSlaAuthenticatedHeartbeatProbe(deps: {
  store: SlaHeartbeatStore;
  resolveSource(input: { organizationId: number; component: SlaHeartbeatComponent }): Promise<string | null>;
  environment: Environment;
}) {
  return async function probe(input: Scope): Promise<ScopedSlaProbeEvidence> {
    if (!validId(input.organizationId) ||
      !["scheduler", "adapter"].includes(input.component)) {
      throw new Error("Escopo SLA inválido.");
    }
    const unknown = (): ScopedSlaProbeEvidence => ({
      organizationId: input.organizationId,
      state: "unknown",
      checkedAt: null,
    });
    if (!slaHeartbeatReadAllowed(deps.environment)) return unknown();
    let nowMs: number;
    try {
      nowMs = instant(input.now);
    } catch {
      return unknown();
    }
    try {
      const approved = await deps.resolveSource({
        organizationId: input.organizationId, component: input.component,
      });
      if (!validSource(approved)) return unknown();
      const row = await deps.store.read({
        organizationId: input.organizationId, component: input.component,
      });
      if (!row || row.organizationId !== input.organizationId ||
        row.component !== input.component || row.sourceId !== approved ||
        !["healthy", "degraded", "unhealthy"].includes(row.state) ||
        !Number.isSafeInteger(row.sequence) || row.sequence < 1 ||
        !Number.isSafeInteger(row.sentAtMs) ||
        !Number.isSafeInteger(row.receivedAtMs) ||
        row.sentAtMs > row.receivedAtMs ||
        row.sentAtMs > nowMs ||
        row.receivedAtMs > nowMs ||
        nowMs - row.sentAtMs > SLA_HEARTBEAT_MAX_AGE_MS ||
        nowMs - row.receivedAtMs > SLA_HEARTBEAT_MAX_AGE_MS) {
        return unknown();
      }
      return {
        organizationId: input.organizationId,
        state: row.state,
        checkedAt: new Date(row.sentAtMs).toISOString(),
      };
    } catch {
      // No raw SQL, source configuration or provider error in a supervisor response.
      return unknown();
    }
  };
}

/**
 * One-shot trusted-component integration point. It is NOT a timer, scheduler
 * or API: an authorized running component must call this AFTER an actual
 * liveness check. A caller cannot provide an arbitrary "healthy" value.
 * Failures produce unhealthy evidence, never healthy evidence.
 *
 * No automatic retry on concurrent CAS loss; caller must obtain a fresh
 * authorized sequence for a later attempt.
 */
export function createSlaVerifiedComponentEmitter(deps: {
  store: SlaHeartbeatStore;
  signer: SlaHeartbeatSigner;
  organizationId: number;
  component: SlaHeartbeatComponent;
  checkLive(): Promise<"healthy" | "degraded">;
  environment: Environment;
}) {
  return {
    async checkAndEmit(now: string): Promise<void> {
      if (!slaHeartbeatIngestAllowed(deps.environment)) {
        throw new Error("Emissão SLA desabilitada.");
      }
      if (!validId(deps.organizationId) || !validSource(deps.signer.sourceId) ||
        !["scheduler", "adapter"].includes(deps.component)) {
        throw new Error("Emissor SLA inválido.");
      }
      const nowMs = instant(now);
      // Only the trusted callback determines state, not client input or DB rows.
      let state: SlaHeartbeatState;
      try {
        const result = await deps.checkLive();
        state = result === "healthy" || result === "degraded"
          ? result : "unhealthy";
      } catch {
        state = "unhealthy";
      }
      // One DB row per tenant/component across all replicas, with atomic CAS.
      const previous = await deps.store.read({
        organizationId: deps.organizationId, component: deps.component,
      });
      if (previous && previous.sourceId !== deps.signer.sourceId) {
        throw new Error("Emissor SLA não corresponde à fonte autorizada.");
      }
      if (previous && (!Number.isSafeInteger(previous.sequence) ||
        previous.sequence >= Number.MAX_SAFE_INTEGER ||
        previous.sentAtMs >= nowMs)) {
        throw new Error("Sequência SLA inválida.");
      }
      const packet = signSlaHeartbeat({
        version: "v1",
        organizationId: deps.organizationId,
        component: deps.component,
        sourceId: deps.signer.sourceId,
        sequence: (previous?.sequence ?? 0) + 1,
        state,
        sentAt: now,
      }, deps.signer.secret);
      const service = createSlaHeartbeatService({
        store: deps.store,
        environment: deps.environment,
        resolveSigner: async ({ organizationId, component }) =>
          organizationId === deps.organizationId && component === deps.component
            ? deps.signer : null,
      });
      await service.ingest(packet, new Date(nowMs).toISOString());
    },
  };
}
