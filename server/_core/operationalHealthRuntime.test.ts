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

  it("é idempotente por app e não cria agenda duplicada", () => {
    const registry = createHealthRegistry([]);
    const registerRoutes = vi.fn();
    const start = vi.fn();
    const createWatchdog = vi.fn(() => ({ runOnce: vi.fn(), start, stop: vi.fn() }));
    const app = {} as any;
    const options = {
      registry,
      registerRoutes,
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
    };

    const first = installOperationalHealthRuntime(app, options);
    const second = installOperationalHealthRuntime(app, options);

    expect(second).toBe(first);
    expect(registerRoutes).toHaveBeenCalledTimes(1);
    expect(createWatchdog).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("registra somente os campos sanitizados da transição", async () => {
    const logTransition = vi.fn();
    let transitionHandler: ((transition: any) => void | Promise<void>) | undefined;
    const createWatchdog = vi.fn(options => {
      transitionHandler = options.onTransition;
      return { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() };
    });

    installOperationalHealthRuntime({} as any, {
      registry: createHealthRegistry([]),
      registerRoutes: vi.fn(),
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
      logTransition,
    });

    await transitionHandler?.({
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-07T17:00:00.000Z",
      exception: "mysql://user:pass@secret-host/db",
      stack: "Bearer secret-token",
    });

    expect(logTransition).toHaveBeenCalledWith({
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-07T17:00:00.000Z",
    });
    expect(JSON.stringify(logTransition.mock.calls)).not.toContain("secret-host");
    expect(JSON.stringify(logTransition.mock.calls)).not.toContain("secret-token");
  });

  it("encaminha a mesma transição sanitizada ao recovery handler", async () => {
    const recoveryTransitionHandler = vi.fn();
    const logTransition = vi.fn();
    let transitionHandler: ((transition: any) => void | Promise<void>) | undefined;
    const createWatchdog = vi.fn(options => {
      transitionHandler = options.onTransition;
      return { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() };
    });

    installOperationalHealthRuntime({} as any, {
      registry: createHealthRegistry([]),
      registerRoutes: vi.fn(),
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
      logTransition,
      recoveryTransitionHandler,
    });

    await transitionHandler?.({
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-07T12:00:00.000Z",
      secret: "must-not-leak",
    });

    const sanitized = {
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-07T12:00:00.000Z",
    };
    expect(logTransition).toHaveBeenCalledWith(sanitized);
    expect(recoveryTransitionHandler).toHaveBeenCalledWith(sanitized);
    expect(JSON.stringify(recoveryTransitionHandler.mock.calls)).not.toContain("must-not-leak");
  });

  it("isola rejeição do recovery handler e permite transições futuras", async () => {
    const recoveryTransitionHandler = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret-recovery-error"))
      .mockResolvedValueOnce(undefined);
    let transitionHandler: ((transition: any) => void | Promise<void>) | undefined;
    const createWatchdog = vi.fn(options => {
      transitionHandler = options.onTransition;
      return { runOnce: vi.fn(), start: vi.fn(), stop: vi.fn() };
    });

    installOperationalHealthRuntime({} as any, {
      registry: createHealthRegistry([]),
      registerRoutes: vi.fn(),
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
      recoveryTransitionHandler,
    });

    await expect(
      transitionHandler?.({
        componentId: "database",
        from: "healthy",
        to: "unhealthy",
        occurredAt: "2026-09-07T12:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
    await expect(
      transitionHandler?.({
        componentId: "database",
        from: "unhealthy",
        to: "healthy",
        occurredAt: "2026-09-07T12:00:05.000Z",
      }),
    ).resolves.toBeUndefined();
    expect(recoveryTransitionHandler).toHaveBeenCalledTimes(2);
  });

  it("mantém um único caminho de recovery ao instalar duas vezes no mesmo app", async () => {
    const registry = createHealthRegistry([]);
    const app = {} as any;
    const start = vi.fn();
    let transitionHandler: ((transition: any) => void | Promise<void>) | undefined;
    const createWatchdog = vi.fn(options => {
      transitionHandler = options.onTransition;
      return { runOnce: vi.fn(), start, stop: vi.fn() };
    });
    const firstRecovery = vi.fn();
    const secondRecovery = vi.fn();
    const base = {
      registry,
      registerRoutes: vi.fn(),
      createWatchdog,
      watchdogIntervalMs: 5_000,
      watchdogPolicy: { failuresToUnhealthy: 2, successesToRecover: 2, cooldownMs: 10_000 },
    };

    installOperationalHealthRuntime(app, { ...base, recoveryTransitionHandler: firstRecovery });
    installOperationalHealthRuntime(app, { ...base, recoveryTransitionHandler: secondRecovery });
    await transitionHandler?.({
      componentId: "database",
      from: "healthy",
      to: "unhealthy",
      occurredAt: "2026-09-07T12:00:00.000Z",
    });

    expect(createWatchdog).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(firstRecovery).toHaveBeenCalledTimes(1);
    expect(secondRecovery).not.toHaveBeenCalled();
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
