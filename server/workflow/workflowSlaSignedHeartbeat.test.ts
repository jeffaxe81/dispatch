import { describe, expect, it, vi } from "vitest";
import {
  createSlaHeartbeatService, signSlaHeartbeat, slaHeartbeatIngestAllowed,
  verifySlaHeartbeat, type AcceptedSlaHeartbeat, type SlaHeartbeatStore,
} from "./workflowSlaSignedHeartbeat";

const secret = "t".repeat(48);
const now = "2026-10-22T22:00:00.000Z";
const unsigned = {
  version: "v1" as const, organizationId: 9, component: "scheduler" as const,
  sourceId: "scheduler-primary", sequence: 1, state: "healthy" as const, sentAt: now,
};
const packet = () => signSlaHeartbeat(unsigned, secret);

function fixture() {
  const rows = new Map<string, AcceptedSlaHeartbeat>();
  const store: SlaHeartbeatStore = {
    accept: vi.fn(async record => {
      const key = [record.organizationId, record.component].join(":");
      const prev = rows.get(key);
      if (prev && (record.sequence <= prev.sequence ||
        record.sentAtMs <= prev.sentAtMs || record.sourceId !== prev.sourceId)) return false;
      rows.set(key, record);
      return true;
    }),
    read: vi.fn(async input => rows.get([input.organizationId, input.component].join(":")) ?? null),
  };
  const resolveSigner = vi.fn(async ({ organizationId, component }) =>
    organizationId === 9 && component === "scheduler"
      ? { sourceId: "scheduler-primary", secret } : null);
  const environment = {
    NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation",
    AXE_SLA_HEARTBEAT_INGEST_ENABLED: "true",
  };
  const service = createSlaHeartbeatService({ store, resolveSigner, environment });
  return { service, store, resolveSigner, environment };
}

describe("D-012J J6D — signed and tenant-scoped heartbeat protocol", () => {
  it("verifica HMAC SHA-256, fonte autorizada e conteúdo íntegro", () => {
    expect(verifySlaHeartbeat({
      packet: packet(), signer: { sourceId: "scheduler-primary", secret }, now,
    })).toEqual({
      organizationId: 9, component: "scheduler", sourceId: "scheduler-primary",
      sequence: 1, state: "healthy",
      sentAtMs: Date.parse(now), receivedAtMs: Date.parse(now),
    });
    const valid = packet();
    for (const changed of [
      { ...valid, organizationId: 10 },
      { ...valid, component: "adapter" as const },
      { ...valid, state: "degraded" as const },
      { ...valid, sequence: 2 },
      { ...valid, sentAt: "2026-10-22T21:59:00.000Z" },
      { ...valid, signature: "0".repeat(64) },
    ]) expect(() => verifySlaHeartbeat({
      packet: changed, signer: { sourceId: "scheduler-primary", secret }, now,
    })).toThrow(/rejeitado/i);
    expect(() => verifySlaHeartbeat({
      packet: valid, signer: { sourceId: "another-source", secret }, now,
    })).toThrow(/rejeitado/i);
  });

  it("bloqueia segredos fracos, calendário impossível, futuro e expiração", () => {
    expect(() => signSlaHeartbeat(unsigned, "short")).toThrow(/rejeitado/i);
    expect(() => signSlaHeartbeat({ ...unsigned, sentAt: "2026-02-30T00:00:00.000Z" }, secret)).toThrow(/rejeitado/i);
    expect(() => signSlaHeartbeat({ ...unsigned, sequence: -1 }, secret)).toThrow(/rejeitado/i);
    expect(() => verifySlaHeartbeat({
      packet: packet(), signer: { sourceId: "scheduler-primary", secret },
      now: "2026-10-22T21:59:59.999Z",
    })).toThrow(/rejeitado/i);
    expect(() => verifySlaHeartbeat({
      packet: packet(), signer: { sourceId: "scheduler-primary", secret },
      now: "2026-10-22T22:01:00.001Z",
    })).toThrow(/rejeitado/i);
  });

  it("nunca ingere em produção, desligado ou com flag ausente", async () => {
    const f = fixture();
    expect(slaHeartbeatIngestAllowed({ NODE_ENV: "production", AXE_RUNTIME_ENV: "homologation",
      AXE_SLA_HEARTBEAT_INGEST_ENABLED: "true" })).toBe(false);
    expect(slaHeartbeatIngestAllowed({ NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation" })).toBe(false);
    const denied = createSlaHeartbeatService({
      store: f.store, resolveSigner: f.resolveSigner,
      environment: { ...f.environment, NODE_ENV: "production" },
    });
    await expect(denied.ingest(packet(), now)).rejects.toThrow(/desabilitada/i);
    expect(f.store.accept).not.toHaveBeenCalled();
    expect(f.resolveSigner).not.toHaveBeenCalled();
  });

  it("ingere evidência autenticada e rejeita replay, troca de tenant e fonte", async () => {
    const f = fixture();
    await f.service.ingest(packet(), now);
    await expect(f.service.ingest(packet(), now)).rejects.toThrow(/rejeitado/i);
    expect(await f.service.probe({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "healthy", checkedAt: now });
    expect(await f.service.probe({ organizationId: 10, component: "scheduler", now }))
      .toEqual({ organizationId: 10, state: "unknown", checkedAt: null });
    expect(await f.service.probe({ organizationId: 9, component: "adapter", now }))
      .toEqual({ organizationId: 9, state: "unknown", checkedAt: null });
    await expect(f.service.ingest(
      signSlaHeartbeat({ ...unsigned, component: "adapter" }, secret), now,
    )).rejects.toThrow(/rejeitado/i);
    expect(f.store.accept).toHaveBeenCalledTimes(2);
  });

  it("aceita sequência crescente, expira evidência e nunca expõe segredo", async () => {
    const f = fixture();
    await f.service.ingest(packet(), now);
    const next = "2026-10-22T22:00:20.000Z";
    await f.service.ingest(signSlaHeartbeat({
      ...unsigned, sequence: 2, state: "degraded", sentAt: next,
    }, secret), next);
    expect(await f.service.probe({ organizationId: 9, component: "scheduler", now: next }))
      .toEqual({ organizationId: 9, state: "degraded", checkedAt: next });
    const stale = await f.service.probe({
      organizationId: 9, component: "scheduler", now: "2026-10-22T22:01:20.001Z",
    });
    expect(stale).toEqual({ organizationId: 9, state: "unknown", checkedAt: null });
    expect(JSON.stringify(stale)).not.toContain(secret);
  });

  it("falha fechado para fonte ausente, DB falho e erros sanitizados", async () => {
    const f = fixture();
    f.resolveSigner.mockRejectedValueOnce(new Error("private-secret"));
    await expect(f.service.ingest(packet(), now)).rejects.toThrow("Heartbeat SLA rejeitado.");
    f.resolveSigner.mockResolvedValueOnce(null);
    await expect(f.service.ingest(packet(), now)).rejects.toThrow("Heartbeat SLA rejeitado.");
    vi.mocked(f.store.accept).mockRejectedValueOnce(new Error("credential=abc"));
    await expect(f.service.ingest(packet(), now)).rejects.toThrow("Heartbeat SLA rejeitado.");
    vi.mocked(f.store.read).mockRejectedValueOnce(new Error("SQL password=xyz"));
    expect(await f.service.probe({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "unknown", checkedAt: null });
  });

  it("não permite estados e IDs inválidos", async () => {
    const f = fixture();
    await expect(f.service.probe({ organizationId: -3, component: "scheduler", now }))
      .rejects.toThrow(/escopo/i);
    expect(() => signSlaHeartbeat({ ...unsigned, state: "ready" as never }, secret))
      .toThrow(/rejeitado/i);
  });
});
