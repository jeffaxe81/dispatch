export type RecoveryActionRecordState =
  | "reserved"
  | "executing"
  | "completed_success"
  | "completed_failure"
  | "verification_failed"
  | "unknown_outcome";

export type RecoveryActionRecord = Readonly<{
  actionId: string;
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

export function sameRecoveryActionIdentity(
  record: RecoveryActionRecord,
  input: Pick<RecoveryActionRecord, "actionId" | "componentId" | "correlationId" | "action">,
): boolean {
  return record.actionId === input.actionId
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
