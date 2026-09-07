import { describe, expect, it, vi } from "vitest";
import { createHealthRegistry } from "./healthRegistry";
import { installOperationalHealthRuntime } from "./operationalHealthRuntime";

describe("D-011A operational health runtime", () => {
  it("compartilha uma única instância de registry entre HTTP e watchdog e inicia uma vez", () => {
    const registry = createHealthRegistry([]);
    const registerRoutes = vi.fn();
    const start = vi.fn();
    const stop = vi.fn();
    const createWatchdog = vi.fn(options => {
      expect(options.registry).toBe(registry);
      return { runOnce: vi.fn(), start, stop };
    });
    const app = {} as any;

    const runtime = installOperationalHealthRuntime(app, {
      registry,
      registerRoutes,
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 3, successesToRecover: 2, cooldownMs: 30_000 },
      onTransition: vi.fn(),
    });

    expect(registerRoutes).toHaveBeenCalledTimes(1);
    expect(registerRoutes).toHaveBeenCalledWith(app, { registry });
    expect(createWatchdog).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(runtime.registry).toBe(registry);
    expect(runtime.watchdog).toBeDefined();
  });

  it("não expõe nenhuma ação de restart/recover no runtime instalado", () => {
    const runtime = installOperationalHealthRuntime({} as any, {
      registry: createHealthRegistry([]),
      registerRoutes: vi.fn(),
      createWatchdog: vi.fn(() => ({ runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() })),
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
    });

    expect(runtime).not.toHaveProperty("restart");
    expect(runtime).not.toHaveProperty("recover");
    expect(runtime.watchdog).not.toHaveProperty("restart");
    expect(runtime.watchdog).not.toHaveProperty("recover");
  });
});
