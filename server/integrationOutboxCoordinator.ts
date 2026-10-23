import {
  buildIntegrationOutboxClaim,
  buildIntegrationOutboxResolution,
  type IntegrationOutboxSnapshot,
  type createIntegrationOutboxMySqlStorage,
} from "./integrationOutboxCas";

type OutboxStorage = Pick<
  ReturnType<typeof createIntegrationOutboxMySqlStorage>,
  "loadByTenant" | "compareAndSwap"
>;
type Resolution = Parameters<typeof buildIntegrationOutboxResolution>[1];
type WithoutClock<T> = T extends unknown ? Omit<T, "nowEpochMs"> : never;
type ResolutionRequest = WithoutClock<Resolution>;

export class IntegrationOutboxCoordinatorConflictError extends Error {
  constructor() {
    super("Conflito CAS da outbox: entrega alterada por outro trabalhador.");
    this.name = "IntegrationOutboxCoordinatorConflictError";
  }
}

function assertIdentifier(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(label + " inválido.");
  }
}
function assertEnabled(): void {
  if (process.env.NODE_ENV !== "test"
    || process.env.AXE_RUNTIME_ENV !== "homologation"
    || process.env.AXE_INTEGRATION_OUTBOX_J23_ENABLED !== "true") {
    throw new Error("Coordenador J23 desabilitado fora de homologação isolada.");
  }
}

function assertScope(
  current: IntegrationOutboxSnapshot | null,
  scope: { organizationId: number; deliveryId: number },
): asserts current is IntegrationOutboxSnapshot {
  if (!current) throw new Error("Entrega não encontrada na organização autorizada.");
  if (current.organizationId !== scope.organizationId
    || current.deliveryId !== scope.deliveryId) {
    throw new Error("Escopo da outbox incompatível com organização/entrega.");
  }
}

/**
 * Internal, opt-in coordination of a SINGLE tenant-scoped CAS transition.
 *
 * This does not authorize a worker, probe, recipient or external call. A
 * separate durable tenant/system circuit lease and authorized execution
 * boundary MUST gate any future transport. No scheduler or route imports it.
 */
export function createIntegrationOutboxCasCoordinator(
  storage: OutboxStorage,
  clock: () => number = Date.now,
) {
  return {
    async claim(input: {
      organizationId: number;
      deliveryId: number;
      workerId: string;
      leaseToken: string;
      leaseDurationMs: number;
    }): Promise<IntegrationOutboxSnapshot> {
      assertEnabled();
      assertIdentifier(input.organizationId, "Organização");
      assertIdentifier(input.deliveryId, "Entrega");
      const current = await storage.loadByTenant(input);
      assertScope(current, input);
      // Read the trusted clock only after potentially blocked database reads.
      const nowEpochMs = clock();
      const next = buildIntegrationOutboxClaim(current, {
        nowEpochMs, workerId: input.workerId,
        leaseToken: input.leaseToken, leaseDurationMs: input.leaseDurationMs,
      });
      assertEnabled();
      const changed = await storage.compareAndSwap({
        organizationId: input.organizationId,
        deliveryId: input.deliveryId,
        expectedVersion: current.version,
        nowEpochMs,
        current, next,
      });
      if (!changed) throw new IntegrationOutboxCoordinatorConflictError();
      return next;
    },

    async resolve(input: {
      organizationId: number;
      deliveryId: number;
      workerId: string;
      expectedVersion: number;
    } & ResolutionRequest): Promise<IntegrationOutboxSnapshot> {
      assertEnabled();
      assertIdentifier(input.organizationId, "Organização");
      assertIdentifier(input.deliveryId, "Entrega");
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw new Error("Versão esperada do lease inválida.");
      }
      const current = await storage.loadByTenant(input);
      assertScope(current, input);
      if (current.version !== input.expectedVersion) {
        throw new IntegrationOutboxCoordinatorConflictError();
      }
      if (current.leaseOwner !== input.workerId) {
        throw new Error("Worker obsoleto ou diferente do proprietário do lease.");
      }
      const nowEpochMs = clock();
      // Drop caller clock (if present at runtime), never trust browser or
      // worker supplied time. Only the internally injected clock is used.
      const transition: Resolution = input.outcome === "delivered"
        ? { outcome: "delivered", leaseToken: input.leaseToken, nowEpochMs }
        : input.outcome === "retry"
        ? {
          outcome: "retry", leaseToken: input.leaseToken, nowEpochMs,
          failureKind: input.failureKind,
          nextAttemptAtMs: input.nextAttemptAtMs,
        }
        : {
          outcome: "dead_letter", leaseToken: input.leaseToken, nowEpochMs,
          failureKind: input.failureKind,
        };
      const next = buildIntegrationOutboxResolution(current, transition);
      assertEnabled();
      const changed = await storage.compareAndSwap({
        organizationId: input.organizationId,
        deliveryId: input.deliveryId,
        expectedVersion: input.expectedVersion,
        nowEpochMs,
        current, next,
      });
      if (!changed) throw new IntegrationOutboxCoordinatorConflictError();
      assertEnabled();
      return next;
    },
  };
}
