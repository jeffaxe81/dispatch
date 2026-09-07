import { describe, expect, it, vi } from "vitest";
import type { HealthSnapshot, HealthState } from "./healthRegistry";
import { createHealthHysteresisMonitor, createPassiveHealthWatchdog } from "./healthWatchdog";

function snapshot(state: HealthState, checkedAt = "2026-09-07T17:30:00.000Z"): HealthSnapshot {
  return {
    status: state === "healthy" ? "ready" : state === "degraded" ? "degraded" : "not_ready",
    checkedAt,
    components: [{
      id: "database",
      name: "Banco de dados",
      state,
      criticality: "critical",
      blocksReadiness: true,
      checkedAt,
      durationMs: 1,
    }],
  };
}

const policy = { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 1_000 };

describe("D-011A health hysteresis monitor", () => {
  it("ignora falha transitória e só transiciona após limiar consecutivo", () => {
    const monitor = createHealthHysteresisMonitor(policy);
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:00.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("unhealthy"), new Date("2026-09-07T17:30:01.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:02.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("unhealthy"), new Date("2026-09-07T17:30:03.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("unhealthy"), new Date("2026-09-07T17:30:04.000Z"))).toEqual([
      expect.objectContaining({ componentId: "database", from: "healthy", to: "unhealthy" }),
    ]);
  });

  it("exige sucessos consecutivos para recuperar e trata unknown como falha", () => {
    const monitor = createHealthHysteresisMonitor({ ...policy, cooldownMs: 0 });
    monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:00.000Z"));
    monitor.observe(snapshot("unknown"), new Date("2026-09-07T17:30:01.000Z"));
    expect(monitor.observe(snapshot("unknown"), new Date("2026-09-07T17:30:02.000Z"))[0]).toEqual(
      expect.objectContaining({ from: "healthy", to: "unknown" }),
    );
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:03.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:04.000Z"))[0]).toEqual(
      expect.objectContaining({ from: "unknown", to: "healthy" }),
    );
  });

  it("aplica cooldown para evitar flapping de transições opostas", () => {
    const monitor = createHealthHysteresisMonitor({ failuresToUnhealthy: 1, successesToRecover: 1, cooldownMs: 10_000 });
    monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:00.000Z"));
    expect(monitor.observe(snapshot("unhealthy"), new Date("2026-09-07T17:30:01.000Z"))).toHaveLength(1);
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:02.000Z"))).toEqual([]);
    expect(monitor.observe(snapshot("healthy"), new Date("2026-09-07T17:30:12.000Z"))[0]).toEqual(
      expect.objectContaining({ from: "unhealthy", to: "healthy" }),
    );
  });
});

describe("D-011A passive watchdog", () => {
  it("não executa ciclos sobrepostos e publica somente transições", async () => {
    let releaseFirst!: (value: HealthSnapshot) => void;
    const first = new Promise<HealthSnapshot>(resolve => { releaseFirst = resolve; });
    const probeAll = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(snapshot("healthy"));
    const onTransition = vi.fn();
    const watchdog = createPassiveHealthWatchdog({
      registry: { definitions: [], probeAll },
      intervalMs: 1_000,
      policy,
      onTransition,
    });

    const running = watchdog.runOnce(new Date("2026-09-07T17:30:00.000Z"));
    await expect(watchdog.runOnce(new Date("2026-09-07T17:30:00.100Z"))).resolves.toBeNull();
    expect(probeAll).toHaveBeenCalledTimes(1);
    releaseFirst(snapshot("healthy"));
    await expect(running).resolves.toEqual(snapshot("healthy"));
    expect(onTransition).not.toHaveBeenCalled();
  });

  it("start/stop usa timer desacoplado e unref sem qualquer ação de restart", () => {
    const unref = vi.fn();
    const clear = vi.fn();
    const schedule = vi.fn(() => ({ unref }));
    const watchdog = createPassiveHealthWatchdog({
      registry: { definitions: [], probeAll: vi.fn(async () => snapshot("healthy")) },
      intervalMs: 1_000,
      policy,
      scheduler: { schedule, clear },
    });

    watchdog.start();
    watchdog.start();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
    watchdog.stop();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(watchdog).not.toHaveProperty("restart");
    expect(watchdog).not.toHaveProperty("recover");
  });
});
