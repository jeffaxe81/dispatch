import { createHmac, timingSafeEqual } from "node:crypto";
import type { ScopedSlaProbeEvidence } from "./workflowSlaDiagnosticPreview";

export type SlaHeartbeatComponent = "scheduler" | "adapter";
export type SlaHeartbeatState = "healthy" | "degraded" | "unhealthy";
export type SlaSignedHeartbeat = {
  version: "v1";
  organizationId: number;
  component: SlaHeartbeatComponent;
  sourceId: string;
  sequence: number;
  state: SlaHeartbeatState;
  sentAt: string;
  signature: string;
};

export type AcceptedSlaHeartbeat = {
  organizationId: number;
  component: SlaHeartbeatComponent;
  sourceId: string;
  sequence: number;
  state: SlaHeartbeatState;
  sentAtMs: number;
  receivedAtMs: number;
};

export type SlaHeartbeatStore = {
  /** MUST enforce atomic increasing sequence and timestamp per tenant/component across nodes. */
  accept(record: AcceptedSlaHeartbeat): Promise<boolean>;
  read(input: { organizationId: number; component: SlaHeartbeatComponent }): Promise<AcceptedSlaHeartbeat | null>;
};

export type SlaHeartbeatSigner = {
  /** Trusted server-side allowlist; never derived from a client-supplied key. */
  sourceId: string;
  secret: string | Buffer;
};

export const SLA_HEARTBEAT_MAX_AGE_MS = 60_000;

function validTime(value: string): number {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Heartbeat SLA rejeitado.");
  }
  const valueMs = Date.parse(value);
  if (!Number.isSafeInteger(valueMs) || valueMs < 0 ||
    new Date(valueMs).toISOString() !== value) {
    throw new Error("Heartbeat SLA rejeitado.");
  }
  return valueMs;
}

function validate(packet: SlaSignedHeartbeat): number {
  if (!packet || packet.version !== "v1" ||
    !Number.isSafeInteger(packet.organizationId) || packet.organizationId < 1 ||
    !["scheduler", "adapter"].includes(packet.component) ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(packet.sourceId) ||
    !Number.isSafeInteger(packet.sequence) || packet.sequence < 1 ||
    !["healthy", "degraded", "unhealthy"].includes(packet.state)) {
    throw new Error("Heartbeat SLA rejeitado.");
  }
  return validTime(packet.sentAt);
}

function canonical(packet: SlaSignedHeartbeat): string {
  return JSON.stringify([
    "axe-dispatch-sla-heartbeat-v1", packet.organizationId,
    packet.component, packet.sourceId, packet.sequence,
    packet.state, packet.sentAt,
  ]);
}

function makeMac(packet: SlaSignedHeartbeat, secret: string | Buffer): Buffer {
  if (Buffer.byteLength(secret) < 32) throw new Error("Heartbeat SLA rejeitado.");
  return createHmac("sha256", secret).update(canonical(packet), "utf8").digest();
}

/** For approved emitters and deterministic fixture generation. No secrets in outputs. */
export function signSlaHeartbeat(
  packet: Omit<SlaSignedHeartbeat, "signature">,
  secret: string | Buffer,
): SlaSignedHeartbeat {
  const provisional: SlaSignedHeartbeat = { ...packet, signature: "" };
  validate(provisional);
  return { ...provisional, signature: makeMac(provisional, secret).toString("hex") };
}

export function verifySlaHeartbeat(input: {
  packet: SlaSignedHeartbeat;
  signer: SlaHeartbeatSigner;
  now: string;
  maxAgeMs?: number;
}): AcceptedSlaHeartbeat {
  const { packet, signer } = input;
  const sentAtMs = validate(packet);
  const nowMs = validTime(input.now);
  const ttl = input.maxAgeMs ?? SLA_HEARTBEAT_MAX_AGE_MS;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 60_000 ||
    nowMs < sentAtMs || nowMs - sentAtMs > ttl ||
    !signer || signer.sourceId !== packet.sourceId ||
    typeof packet.signature !== "string" || !/^[0-9a-f]{64}$/.test(packet.signature)) {
    throw new Error("Heartbeat SLA rejeitado.");
  }
  const expected = makeMac(packet, signer.secret);
  const provided = Buffer.from(packet.signature, "hex");
  if (!timingSafeEqual(provided, expected)) throw new Error("Heartbeat SLA rejeitado.");
  return {
    organizationId: packet.organizationId,
    component: packet.component,
    sourceId: packet.sourceId,
    sequence: packet.sequence,
    state: packet.state,
    sentAtMs,
    receivedAtMs: nowMs,
  };
}

/** Ingest is deliberately not exposed as an HTTP or tRPC endpoint. */
export function slaHeartbeatIngestAllowed(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" &&
    env.AXE_RUNTIME_ENV === "homologation" &&
    env.AXE_SLA_HEARTBEAT_INGEST_ENABLED === "true";
}

export function createSlaHeartbeatService(deps: {
  store: SlaHeartbeatStore;
  resolveSigner(input: {
    organizationId: number;
    component: SlaHeartbeatComponent;
  }): Promise<SlaHeartbeatSigner | null>;
  environment: Record<string, string | undefined>;
}) {
  return {
    async ingest(packet: SlaSignedHeartbeat, now: string): Promise<void> {
      if (!slaHeartbeatIngestAllowed(deps.environment)) {
        throw new Error("Ingestão SLA desabilitada.");
      }
      // Do not reach the DB for unauthenticated or invalid heartbeat input.
      const sentAtMs = validate(packet);
      const nowMs = validTime(now);
      if (sentAtMs > nowMs || nowMs - sentAtMs > SLA_HEARTBEAT_MAX_AGE_MS) {
        throw new Error("Heartbeat SLA rejeitado.");
      }
      let signer: SlaHeartbeatSigner | null;
      try {
        signer = await deps.resolveSigner({
          organizationId: packet.organizationId, component: packet.component,
        });
      } catch {
        throw new Error("Heartbeat SLA rejeitado.");
      }
      if (!signer) throw new Error("Heartbeat SLA rejeitado.");
      const accepted = verifySlaHeartbeat({ packet, signer, now });
      let stored = false;
      try {
        stored = await deps.store.accept(accepted);
      } catch {
        throw new Error("Heartbeat SLA rejeitado.");
      }
      if (!stored) throw new Error("Heartbeat SLA rejeitado.");
    },
    async probe(input: {
      organizationId: number;
      component: SlaHeartbeatComponent;
      now: string;
    }): Promise<ScopedSlaProbeEvidence> {
      if (!Number.isSafeInteger(input.organizationId) || input.organizationId < 1 ||
        !["scheduler", "adapter"].includes(input.component)) {
        throw new Error("Escopo SLA inválido.");
      }
      const nowMs = validTime(input.now);
      const unknown = (): ScopedSlaProbeEvidence => ({
        organizationId: input.organizationId, state: "unknown", checkedAt: null,
      });
      try {
        const record = await deps.store.read({
          organizationId: input.organizationId, component: input.component,
        });
        if (!record || record.organizationId !== input.organizationId ||
          record.component !== input.component ||
          !["healthy", "degraded", "unhealthy"].includes(record.state) ||
          !Number.isSafeInteger(record.sentAtMs) ||
          record.sentAtMs > nowMs ||
          nowMs - record.sentAtMs > SLA_HEARTBEAT_MAX_AGE_MS) return unknown();
        return {
          organizationId: input.organizationId,
          state: record.state,
          checkedAt: new Date(record.sentAtMs).toISOString(),
        };
      } catch {
        return unknown();
      }
    },
  };
}
