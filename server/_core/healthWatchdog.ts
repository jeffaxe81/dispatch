import type { HealthRegistry, HealthSnapshot, HealthState } from "./healthRegistry";

export type HealthHysteresisPolicy = {
  failuresToUnhealthy: number;
  successesToRecover: number;
  cooldownMs: number;
};

export type HealthTransition = {
  componentId: string;
  from: HealthState;
  to: HealthState;
  occurredAt: string;
};

export type HealthHysteresisMonitor = {
  observe(snapshot: HealthSnapshot, now?: Date): HealthTransition[];
};

type ComponentState = {
  stable: HealthState;
  failureCount: number;
  successCount: number;
  pendingFailure: HealthState | null;
  pendingSuccess: HealthState | null;
  lastTransitionAt: number | null;
};

export type WatchdogTimerHandle = {
  unref?: () => unknown;
};

export type WatchdogScheduler = {
  schedule(callback: () => void, intervalMs: number): WatchdogTimerHandle;
  clear(handle: WatchdogTimerHandle): void;
};

export type PassiveHealthWatchdogOptions = {
  registry: HealthRegistry;
  intervalMs: number;
  policy: HealthHysteresisPolicy;
  onTransition?: (transition: HealthTransition) => void | Promise<void>;
  scheduler?: WatchdogScheduler;
};

export type PassiveHealthWatchdog = {
  runOnce(now?: Date): Promise<HealthSnapshot | null>;
  start(): void;
  stop(): void;
};

function assertPolicy(policy: HealthHysteresisPolicy): void {
  if (!Number.isInteger(policy.failuresToUnhealthy) || policy.failuresToUnhealthy <= 0) {
    throw new Error("failuresToUnhealthy must be a positive integer.");
  }
  if (!Number.isInteger(policy.successesToRecover) || policy.successesToRecover <= 0) {
    throw new Error("successesToRecover must be a positive integer.");
  }
  if (!Number.isFinite(policy.cooldownMs) || policy.cooldownMs < 0) {
    throw new Error("cooldownMs must be zero or positive.");
  }
}

function isFailure(state: HealthState): boolean {
  return state === "unhealthy" || state === "unknown";
}

function transitionAllowed(state: ComponentState, nowMs: number, cooldownMs: number): boolean {
  return state.lastTransitionAt === null || nowMs - state.lastTransitionAt >= cooldownMs;
}

export function createHealthHysteresisMonitor(policy: HealthHysteresisPolicy): HealthHysteresisMonitor {
  assertPolicy(policy);
  const states = new Map<string, ComponentState>();

  return {
    observe(snapshot, now = new Date()) {
      const transitions: HealthTransition[] = [];
      const nowMs = now.getTime();

      for (const component of snapshot.components) {
        const observed = component.state;
        const current = states.get(component.id);
        if (!current) {
          states.set(component.id, {
            stable: observed,
            failureCount: 0,
            successCount: 0,
            pendingFailure: null,
            pendingSuccess: null,
            lastTransitionAt: null,
          });
          continue;
        }

        if (observed === current.stable) {
          current.failureCount = 0;
          current.successCount = 0;
          current.pendingFailure = null;
          current.pendingSuccess = null;
          continue;
        }

        const stableIsFailure = isFailure(current.stable);
        const observedIsFailure = isFailure(observed);
        let target: HealthState | null = null;

        if (!stableIsFailure && observedIsFailure) {
          current.successCount = 0;
          current.pendingSuccess = null;
          if (current.pendingFailure === observed) current.failureCount += 1;
          else {
            current.pendingFailure = observed;
            current.failureCount = 1;
          }
          if (current.failureCount >= policy.failuresToUnhealthy) target = observed;
        } else if (stableIsFailure && !observedIsFailure) {
          current.failureCount = 0;
          current.pendingFailure = null;
          if (current.pendingSuccess === observed) current.successCount += 1;
          else {
            current.pendingSuccess = observed;
            current.successCount = 1;
          }
          if (current.successCount >= policy.successesToRecover) target = observed;
        } else if (!stableIsFailure && !observedIsFailure) {
          target = observed;
        } else {
          current.successCount = 0;
          current.pendingSuccess = null;
          if (current.pendingFailure === observed) current.failureCount += 1;
          else {
            current.pendingFailure = observed;
            current.failureCount = 1;
          }
          if (current.failureCount >= policy.failuresToUnhealthy) target = observed;
        }

        if (target === null || !transitionAllowed(current, nowMs, policy.cooldownMs)) continue;

        const transition: HealthTransition = {
          componentId: component.id,
          from: current.stable,
          to: target,
          occurredAt: now.toISOString(),
        };
        current.stable = target;
        current.failureCount = 0;
        current.successCount = 0;
        current.pendingFailure = null;
        current.pendingSuccess = null;
        current.lastTransitionAt = nowMs;
        transitions.push(transition);
      }

      return transitions;
    },
  };
}

const defaultScheduler: WatchdogScheduler = {
  schedule(callback, intervalMs) {
    return setInterval(callback, intervalMs);
  },
  clear(handle) {
    clearInterval(handle as NodeJS.Timeout);
  },
};

export function createPassiveHealthWatchdog(options: PassiveHealthWatchdogOptions): PassiveHealthWatchdog {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("Watchdog intervalMs must be positive.");
  }
  assertPolicy(options.policy);

  const monitor = createHealthHysteresisMonitor(options.policy);
  const scheduler = options.scheduler ?? defaultScheduler;
  let timer: WatchdogTimerHandle | null = null;
  let cycleRunning = false;

  const runOnce = async (now = new Date()): Promise<HealthSnapshot | null> => {
    if (cycleRunning) return null;
    cycleRunning = true;
    try {
      const snapshot = await options.registry.probeAll(now);
      const transitions = monitor.observe(snapshot, now);
      for (const transition of transitions) {
        await options.onTransition?.(transition);
      }
      return snapshot;
    } finally {
      cycleRunning = false;
    }
  };

  return {
    runOnce,
    start() {
      if (timer) return;
      timer = scheduler.schedule(() => {
        void runOnce().catch(() => undefined);
      }, options.intervalMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      scheduler.clear(timer);
      timer = null;
    },
  };
}
