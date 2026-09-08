export type RecoveryActionRecordState =
  | "reserved"
  | "executing"
  | "completed_success"
  | "completed_failure"
  | "verification_failed"
  | "unknown_outcome";

export type RecoveryActionRecord = Readonly<{
  actionId: string;
  tenantId: string;
  componentId: string;
  correlationId: string;
  action: "restart_component";
  state: RecoveryActionRecordState;
  fencingToken: number;
  createdAt: string;
  updatedAt: string;
}>;

export type RecoveryActionReserveResult =
  | Readonly<{ status: "reserved"; record: RecoveryActionRecord }>
  | Readonly<{ status: "existing_terminal"; record: RecoveryActionRecord }>
  | Readonly<{ status: "existing_non_terminal"; record: RecoveryActionRecord }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "store_unavailable" }>;

export type RecoveryActionRecordPort = {
  reserve(input: Omit<RecoveryActionRecord, "state" | "createdAt" | "updatedAt">): Promise<RecoveryActionReserveResult>;
  updateState(input: {
    actionId: string;
    expectedFencingToken: number;
    state: RecoveryActionRecordState;
    at: string;
  }): Promise<boolean>;
  get(actionId: string): Promise<RecoveryActionRecord | null>;
};

export type RecoveryActionStateTransitionInput = Readonly<{
  expectedState: RecoveryActionRecordState;
  expectedFencingToken: number;
  nextState: RecoveryActionRecordState;
}>;

export type RecoveryActionStateTransitionPlan =
  | Readonly<{ allowed: true; status: "transition" }>
  | Readonly<{
      allowed: false;
      status:
        | "fencing_conflict"
        | "state_conflict"
        | "terminal_conflict"
        | "existing_terminal"
        | "invalid_transition";
    }>;

export type RecoveryExecutionLedgerTransitionInput = Readonly<{
  actionId: string;
  expectedState: RecoveryActionRecordState;
  expectedFencingToken: number;
  nextState: RecoveryActionRecordState;
  at: string;
}>;

export type RecoveryExecutionLedgerTransitionResult =
  | Readonly<{ status: "transitioned"; record: RecoveryActionRecord }>
  | Readonly<{ status: "existing_terminal"; record: RecoveryActionRecord }>
  | Readonly<{ status: "state_conflict"; record?: RecoveryActionRecord }>
  | Readonly<{ status: "fencing_conflict"; record?: RecoveryActionRecord }>
  | Readonly<{ status: "terminal_conflict"; record?: RecoveryActionRecord }>
  | Readonly<{ status: "invalid_transition"; record?: RecoveryActionRecord }>
  | Readonly<{ status: "store_unavailable" }>;

/**
 * Execution-only ledger port. Implementations must perform compareAndSetState atomically
 * in the authoritative store. The D-011B.4 boundary never emulates CAS with get()+update().
 */
export type RecoveryExecutionLedgerPort = {
  get(actionId: string): Promise<RecoveryActionRecord | null>;
  compareAndSetState(
    input: RecoveryExecutionLedgerTransitionInput,
  ): Promise<RecoveryExecutionLedgerTransitionResult>;
};

export function sameRecoveryActionIdentity(
  record: RecoveryActionRecord,
  input: Pick<RecoveryActionRecord, "actionId" | "tenantId" | "componentId" | "correlationId" | "action">,
): boolean {
  return record.actionId === input.actionId
    && record.tenantId === input.tenantId
    && record.componentId === input.componentId
    && record.correlationId === input.correlationId
    && record.action === input.action;
}

export function isTerminalRecoveryActionState(state: RecoveryActionRecordState): boolean {
  return state === "completed_success"
    || state === "completed_failure"
    || state === "verification_failed"
    || state === "unknown_outcome";
}

export function planRecoveryActionStateTransition(
  record: RecoveryActionRecord,
  input: RecoveryActionStateTransitionInput,
): RecoveryActionStateTransitionPlan {
  if (record.fencingToken !== input.expectedFencingToken) {
    return { allowed: false, status: "fencing_conflict" };
  }

  if (isTerminalRecoveryActionState(record.state)) {
    if (record.state === input.nextState && record.state === input.expectedState) {
      return { allowed: false, status: "existing_terminal" };
    }
    return { allowed: false, status: "terminal_conflict" };
  }

  if (record.state !== input.expectedState) {
    return { allowed: false, status: "state_conflict" };
  }

  if (record.state === "reserved" && input.nextState === "executing") {
    return { allowed: true, status: "transition" };
  }

  if (record.state === "executing" && isTerminalRecoveryActionState(input.nextState)) {
    return { allowed: true, status: "transition" };
  }

  return { allowed: false, status: "invalid_transition" };
}

export async function commitRecoveryActionStateTransition(
  port: RecoveryExecutionLedgerPort,
  input: RecoveryExecutionLedgerTransitionInput,
): Promise<RecoveryExecutionLedgerTransitionResult> {
  try {
    return await port.compareAndSetState(input);
  } catch {
    return { status: "store_unavailable" };
  }
}
