/**
 * D-012I I5A — pure delivery lifecycle for SLA intents.
 *
 * IMPORTANT: The caller must persist each transition with a transactional
 * compare-and-swap on (intentId, organizationId, version). A pure transition
 * is not a distributed lock or proof of an externally delivered notification.
 * No worker, timer, network operation or incident mutation is wired here.
 */
export type WorkflowSlaDeliveryStatus = "pending" | "leased" | "delivered" | "dead_letter";
export type WorkflowSlaFailureCode =
  | "timeout"
  | "unavailable"
  | "retryable_rejection"
  | "permanent_rejection";

export type WorkflowSlaDeliveryState = {
  intentId: number;
  taskId: number;
  organizationId: number;
  eventKind: "reminder" | "overdue" | "escalation";
  scheduledAt: string;
  correlationId: string;
  status: WorkflowSlaDeliveryStatus;
  version: number;
  attempts: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  deadLetteredAt: string | null;
  lastFailureCode: WorkflowSlaFailureCode | null;
};

export type WorkflowSlaDeliveryPolicy = {
  maxAttempts: number;
  leaseDurationMs: number;
  baseRetryMs: number;
  maxRetryMs: number;
};

type Principal = { organizationId: number; now: string };
type LeasePrincipal = Principal & {
  workerId: string;
  leaseToken: string;
  expectedVersion: number;
};
export type WorkflowSlaDeliveryAction =
  | (Principal & { type: "claim"; workerId: string; leaseToken: string })
  | (LeasePrincipal & { type: "renew" })
  | (LeasePrincipal & { type: "delivered" })
  | (LeasePrincipal & { type: "failed"; failureCode: WorkflowSlaFailureCode });

export type WorkflowSlaDeliveryOutcome =
  | "claimed" | "renewed" | "delivered" | "retry_scheduled" | "dead_lettered"
  | "not_due" | "retry_wait" | "lease_held" | "terminal";

export type WorkflowSlaDeliveryTransition = {
  outcome: WorkflowSlaDeliveryOutcome;
  state: WorkflowSlaDeliveryState;
};

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} inválido.`);
}

function utcMillis(value: string, label: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} deve ser ISO-8601 UTC com milissegundos.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${label} contém calendário UTC inválido.`);
  }
  return milliseconds;
}

function optionalUtcMillis(value: string | null, label: string): number | null {
  return value === null ? null : utcMillis(value, label);
}

function assertToken(value: string, label: string, maxLength: number) {
  if (typeof value !== "string" || value.trim() !== value
    || value.length < 1 || value.length > maxLength) {
    throw new Error(`${label} inválido.`);
  }
}

function validatePolicy(policy: WorkflowSlaDeliveryPolicy) {
  positiveInteger(policy.maxAttempts, "maxAttempts");
  if (policy.maxAttempts > 20) throw new Error("maxAttempts excede limite.");
  for (const key of ["leaseDurationMs", "baseRetryMs", "maxRetryMs"] as const) {
    positiveInteger(policy[key], key);
    if (policy[key] > 86_400_000) throw new Error(`${key} excede 24 horas.`);
  }
  if (policy.maxRetryMs < policy.baseRetryMs) {
    throw new Error("maxRetryMs deve ser >= baseRetryMs.");
  }
}

export function assertWorkflowSlaDeliveryState(state: WorkflowSlaDeliveryState): void {
  positiveInteger(state.intentId, "intentId");
  positiveInteger(state.taskId, "taskId");
  positiveInteger(state.organizationId, "organizationId");
  if (!["reminder", "overdue", "escalation"].includes(state.eventKind)) {
    throw new Error("Tipo de intenção SLA inválido.");
  }
  utcMillis(state.scheduledAt, "scheduledAt");
  assertToken(state.correlationId, "correlationId", 160);
  if (!Number.isSafeInteger(state.version) || state.version < 0
    || !Number.isSafeInteger(state.attempts) || state.attempts < 0) {
    throw new Error("Versão/tentativas de SLA inválidas.");
  }
  if (!["pending", "leased", "delivered", "dead_letter"].includes(state.status)) {
    throw new Error("Status de intenção SLA inválido.");
  }
  optionalUtcMillis(state.nextAttemptAt, "nextAttemptAt");
  optionalUtcMillis(state.leaseExpiresAt, "leaseExpiresAt");
  optionalUtcMillis(state.deliveredAt, "deliveredAt");
  optionalUtcMillis(state.deadLetteredAt, "deadLetteredAt");
  if (state.lastFailureCode !== null && !["timeout", "unavailable", "retryable_rejection", "permanent_rejection"].includes(state.lastFailureCode)) {
    throw new Error("Código de falha SLA inválido.");
  }
  const hasLease = state.leaseOwner !== null
    && state.leaseToken !== null && state.leaseExpiresAt !== null;
  if (state.status === "leased") {
    if (!hasLease || state.nextAttemptAt !== null
      || state.deliveredAt !== null || state.deadLetteredAt !== null) {
      throw new Error("Reserva SLA incompleta.");
    }
    assertToken(state.leaseOwner!, "leaseOwner", 120);
    assertToken(state.leaseToken!, "leaseToken", 160);
  } else if (state.leaseOwner !== null || state.leaseToken !== null || state.leaseExpiresAt !== null) {
    throw new Error("Reserva SLA presente fora do estado leased.");
  }
  if (state.status === "pending" && (state.deliveredAt !== null || state.deadLetteredAt !== null)
    || state.status === "delivered" && (state.deliveredAt === null || state.deadLetteredAt !== null || state.nextAttemptAt !== null)
    || state.status === "dead_letter" && (state.deadLetteredAt === null || state.deliveredAt !== null || state.nextAttemptAt !== null)) {
    throw new Error("Estado terminal SLA inconsistente.");
  }
}

function validatePrincipal(state: WorkflowSlaDeliveryState, action: WorkflowSlaDeliveryAction) {
  positiveInteger(action.organizationId, "organizationId");
  if (action.organizationId !== state.organizationId) {
    throw new Error("Acesso cruzado a organização SLA negado.");
  }
  if (action.type === "claim" || action.type === "renew" || action.type === "delivered" || action.type === "failed") {
    assertToken(action.workerId, "workerId", 120);
    assertToken(action.leaseToken, "leaseToken", 160);
  }
}

function requireActiveLease(state: WorkflowSlaDeliveryState, action: LeasePrincipal, now: number) {
  if (state.status !== "leased" || state.leaseOwner !== action.workerId
    || state.leaseToken !== action.leaseToken || state.version !== action.expectedVersion) {
    throw new Error("Reserva SLA inexistente ou token/versão obsoletos.");
  }
  if (now >= utcMillis(state.leaseExpiresAt!, "leaseExpiresAt")) {
    throw new Error("Reserva SLA expirada.");
  }
}

function dateAt(now: number, deltaMs: number): string {
  return new Date(now + deltaMs).toISOString();
}

export function transitionWorkflowSlaDelivery(
  state: WorkflowSlaDeliveryState,
  action: WorkflowSlaDeliveryAction,
  policy: WorkflowSlaDeliveryPolicy,
): WorkflowSlaDeliveryTransition {
  assertWorkflowSlaDeliveryState(state);
  validatePolicy(policy);
  validatePrincipal(state, action);
  const now = utcMillis(action.now, "now");
  const result = (outcome: WorkflowSlaDeliveryOutcome, next = state): WorkflowSlaDeliveryTransition =>
    ({ outcome, state: next });

  if (action.type === "claim") {
    if (state.status === "delivered" || state.status === "dead_letter") return result("terminal");
    if (now < utcMillis(state.scheduledAt, "scheduledAt")) return result("not_due");
    if (state.status === "leased" && now < utcMillis(state.leaseExpiresAt!, "leaseExpiresAt")) {
      return result("lease_held");
    }
    if (state.nextAttemptAt && now < utcMillis(state.nextAttemptAt, "nextAttemptAt")) {
      return result("retry_wait");
    }
    if (state.attempts >= policy.maxAttempts) {
      return result("dead_lettered", {
        ...state, status: "dead_letter", version: state.version + 1,
        leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
        nextAttemptAt: null, deadLetteredAt: action.now,
      });
    }
    if (state.leaseToken === action.leaseToken) {
      throw new Error("Nova reserva deve utilizar token diferente da reserva expirada.");
    }
    return result("claimed", {
      ...state, status: "leased", version: state.version + 1,
      attempts: state.attempts + 1,
      leaseOwner: action.workerId, leaseToken: action.leaseToken,
      leaseExpiresAt: dateAt(now, policy.leaseDurationMs), nextAttemptAt: null,
    });
  }

  requireActiveLease(state, action, now);
  if (action.type === "renew") {
    return result("renewed", {
      ...state, version: state.version + 1,
      leaseExpiresAt: dateAt(now, policy.leaseDurationMs),
    });
  }
  const released = {
    ...state, version: state.version + 1,
    leaseOwner: null, leaseToken: null, leaseExpiresAt: null,
  };
  if (action.type === "delivered") {
    return result("delivered", {
      ...released, status: "delivered", deliveredAt: action.now,
      nextAttemptAt: null,
    });
  }
  if (!["timeout", "unavailable", "retryable_rejection", "permanent_rejection"].includes(action.failureCode)) {
    throw new Error("Motivo de falha SLA inválido.");
  }
  if (action.failureCode === "permanent_rejection" || state.attempts >= policy.maxAttempts) {
    return result("dead_lettered", {
      ...released, status: "dead_letter", deadLetteredAt: action.now,
      nextAttemptAt: null, lastFailureCode: action.failureCode,
    });
  }
  const delay = Math.min(policy.maxRetryMs, policy.baseRetryMs * 2 ** (state.attempts - 1));
  return result("retry_scheduled", {
    ...released, status: "pending",
    nextAttemptAt: dateAt(now, delay), lastFailureCode: action.failureCode,
  });
}
