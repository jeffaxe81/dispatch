import { describe, expect, it, vi } from "vitest";
import {
  createSlaAuthenticatedHeartbeatProbe,
  createSlaVerifiedComponentEmitter,
  slaHeartbeatReadAllowed,
} from "./workflowSlaHeartbeatBridge";
import type { AcceptedSlaHeartbeat, SlaHeartbeatStore } from "./workflowSlaSignedHeartbeat";

const now = "2026-10-22T23:00:00.000Z";
const key = "trusted-secret-value-".repeat(3);
const env = {
  NODE_ENV: "test", AXE_RUNTIME_ENV: "homologation",
  AXE_SLA_READINESS_PREVIEW_ENABLED: "true",
  AXE_SLA_HEARTBEAT_READ_ENABLED: "true",
  AXE_SLA_HEARTBEAT_INGEST_ENABLED: "true",
};
function fixture() {
  const records = new Map<string, AcceptedSlaHeartbeat>();
  const store: SlaHeartbeatStore = {
    read: vi.fn(async ({ organizationId, component }) =>
      records.get([organizationId, component].join(":")) ?? null),
    accept: vi.fn(async record => {
      const key = [record.organizationId, record.component].join(":");
      const existing = records.get(key);
      if (existing && (existing.sourceId !== record.sourceId ||
        record.sequence <= existing.sequence || record.sentAtMs <= existing.sentAtMs)) return false;
      records.set(key, record);
      return true;
    }),
  };
  const resolveSource = vi.fn(async ({ organizationId, component }) =>
    organizationId === 9 && component === "scheduler" ? "scheduler-primary" : null);
  const probe = createSlaAuthenticatedHeartbeatProbe({ store, resolveSource, environment: env });
  const live = vi.fn(async () => "healthy" as const);
  const emitter = createSlaVerifiedComponentEmitter({
    store, signer: { sourceId: "scheduler-primary", secret: key },
    organizationId: 9, component: "scheduler", environment: env, checkLive: live,
  });
  return { records, store, resolveSource, probe, live, emitter };
}

describe("D-012J J6E — trusted evidence bridge", () => {
  it("não faz IO de leitura em produção ou quando flag opt-in falta", async () => {
    expect(slaHeartbeatReadAllowed({ ...env, NODE_ENV: "production" })).toBe(false);
    expect(slaHeartbeatReadAllowed({ ...env, AXE_SLA_HEARTBEAT_READ_ENABLED: "false" })).toBe(false);
    const f = fixture();
    const off = createSlaAuthenticatedHeartbeatProbe({
      store: f.store, resolveSource: f.resolveSource,
      environment: { ...env, AXE_SLA_HEARTBEAT_READ_ENABLED: "false" },
    });
    expect(await off({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "unknown", checkedAt: null });
    expect(f.store.read).not.toHaveBeenCalled();
    expect(f.resolveSource).not.toHaveBeenCalled();
    await expect(createSlaVerifiedComponentEmitter({
      store: f.store, signer: { sourceId: "scheduler-primary", secret: key },
      organizationId: 9, component: "scheduler", checkLive: f.live,
      environment: { ...env, NODE_ENV: "production" },
    }).checkAndEmit(now)).rejects.toThrow(/desabilitada/i);
    expect(f.live).not.toHaveBeenCalled();
  });

  it("somente callback de liveness autorizado emite um estado autenticado", async () => {
    const f = fixture();
    expect(await f.probe({ organizationId: 9, component: "scheduler", now }))
      .toMatchObject({ state: "unknown" });
    await f.emitter.checkAndEmit(now);
    expect(f.live).toHaveBeenCalledTimes(1);
    expect(await f.probe({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "healthy", checkedAt: now });
    expect(await f.probe({ organizationId: 10, component: "scheduler", now }))
      .toMatchObject({ organizationId: 10, state: "unknown" });
    expect(await f.probe({ organizationId: 9, component: "adapter", now }))
      .toMatchObject({ organizationId: 9, state: "unknown" });
    expect(JSON.stringify(await f.probe({ organizationId: 9, component: "scheduler", now })))
      .not.toContain(key);
  });

  it("falha no check gera unhealthy e não prontidão positiva", async () => {
    const f = fixture();
    f.live.mockRejectedValueOnce(new Error("secret password internal"));
    await f.emitter.checkAndEmit(now);
    expect(await f.probe({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "unhealthy", checkedAt: now });
  });

  it("expira evidência e rejeita fonte trocada, recepção futura e timestamps incoerentes", async () => {
    const f = fixture();
    await f.emitter.checkAndEmit(now);
    const read = { organizationId: 9, component: "scheduler" as const, now };
    expect((await f.probe({ ...read, now: "2026-10-22T23:01:00.001Z" })).state)
      .toBe("unknown");
    f.resolveSource.mockResolvedValue("scheduler-rotated");
    expect((await f.probe(read)).state).toBe("unknown");
    f.resolveSource.mockResolvedValue("scheduler-primary");
    const stored = f.records.get("9:scheduler")!;
    f.records.set("9:scheduler", { ...stored, receivedAtMs: stored.sentAtMs + 10_000 });
    expect((await f.probe(read)).state).toBe("unknown");
    f.records.set("9:scheduler", { ...stored, receivedAtMs: stored.sentAtMs - 1 });
    expect((await f.probe(read)).state).toBe("unknown");
  });

  it("CAS impede emissões concorrentes ou relógios não crescentes", async () => {
    const f = fixture();
    await f.emitter.checkAndEmit(now);
    await expect(f.emitter.checkAndEmit(now)).rejects.toThrow(/sequência/i);
    const second = createSlaVerifiedComponentEmitter({
      store: f.store, signer: { sourceId: "scheduler-primary", secret: key },
      organizationId: 9, component: "scheduler", checkLive: async () => "degraded",
      environment: env,
    });
    const next = "2026-10-22T23:00:01.000Z";
    const results = await Promise.allSettled([
      f.emitter.checkAndEmit(next), second.checkAndEmit(next),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });

  it("não permite endpoint indireto criar fonte ou autoexecutar healthcheck", async () => {
    const f = fixture();
    const probe = createSlaAuthenticatedHeartbeatProbe({
      store: f.store, resolveSource: async () => {
        throw new Error("secret=private");
      }, environment: env,
    });
    expect(await probe({ organizationId: 9, component: "scheduler", now }))
      .toEqual({ organizationId: 9, state: "unknown", checkedAt: null });
    expect(f.live).not.toHaveBeenCalled();
  });
});
