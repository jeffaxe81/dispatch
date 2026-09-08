import type { Express } from "express";
import type { HealthRegistry } from "./healthRegistry";
import {
  createPassiveHealthWatchdog,
  type HealthHysteresisPolicy,
  type HealthTransition,
  type PassiveHealthWatchdog,
  type PassiveHealthWatchdogOptions,
} from "./healthWatchdog";
import { registerOperationalHealthRoutes } from "./operationalHealth";

export type OperationalHealthRuntime = {
  registry: HealthRegistry;
  watchdog: PassiveHealthWatchdog;
};

export type OperationalHealthRuntimeOptions = {
  registry: HealthRegistry;
  watchdogIntervalMs: number;
  watchdogPolicy: HealthHysteresisPolicy;
  registerRoutes?: (app: Express, options: { registry: HealthRegistry }) => void;
  createWatchdog?: (options: PassiveHealthWatchdogOptions) => PassiveHealthWatchdog;
  onTransition?: (transition: HealthTransition) => void | Promise<void>;
  logTransition?: (transition: HealthTransition) => void;
  recoveryTransitionHandler?: (transition: HealthTransition) => void | Promise<void>;
};

const installedRuntimeByApp = new WeakMap<object, OperationalHealthRuntime>();

function sanitizeTransition(transition: HealthTransition): HealthTransition {
  return {
    componentId: transition.componentId,
    from: transition.from,
    to: transition.to,
    occurredAt: transition.occurredAt,
  };
}

export function installOperationalHealthRuntime(
  app: Express,
  options: OperationalHealthRuntimeOptions,
): OperationalHealthRuntime {
  const existing = installedRuntimeByApp.get(app as object);
  if (existing) return existing;

  const registerRoutes = options.registerRoutes ?? registerOperationalHealthRoutes;
  const createWatchdog = options.createWatchdog ?? createPassiveHealthWatchdog;

  registerRoutes(app, { registry: options.registry });

  const watchdog = createWatchdog({
    registry: options.registry,
    intervalMs: options.watchdogIntervalMs,
    policy: options.watchdogPolicy,
    onTransition: async transition => {
      const sanitized = sanitizeTransition(transition);
      options.logTransition?.(sanitized);
      await options.onTransition?.(sanitized);
      try {
        await options.recoveryTransitionHandler?.(sanitized);
      } catch {
        // D-011B dry-run failures must never escape into the passive watchdog.
      }
    },
  });

  const runtime: OperationalHealthRuntime = {
    registry: options.registry,
    watchdog,
  };

  installedRuntimeByApp.set(app as object, runtime);
  watchdog.start();
  return runtime;
}
