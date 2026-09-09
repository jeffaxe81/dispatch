export type RecoveryLease = Readonly<{
  leaseId: string;
  namespace: "d011b3-v1";
  tenantId: string;
  componentId: string;
  actionId: string;
  ownerId: string;
  fencingToken: number;
  acquiredAt: string;
  expiresAt: string;
}>;

export type RecoveryLeaseAcquireResult =
  | Readonly<{ acquired: true; lease: RecoveryLease }>
  | Readonly<{
      acquired: false;
      reasonCode: "LEASE_HELD" | "LEASE_BACKEND_UNAVAILABLE" | "LEASE_INVALID";
    }>;

export type RecoveryLeasePort = {
  acquire(input: {
    namespace: "d011b3-v1";
    tenantId: string;
    componentId: string;
    actionId: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<RecoveryLeaseAcquireResult>;
  validateFence(lease: RecoveryLease): Promise<boolean>;
  release(lease: RecoveryLease): Promise<void>;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function isValidRecoveryLease(value: unknown): value is RecoveryLease {
  if (typeof value !== "object" || value === null) return false;

  const lease = value as Record<string, unknown>;
  if (!isNonEmptyString(lease.leaseId)) return false;
  if (lease.namespace !== "d011b3-v1") return false;
  if (!isNonEmptyString(lease.tenantId)) return false;
  if (!isNonEmptyString(lease.componentId)) return false;
  if (!isNonEmptyString(lease.actionId)) return false;
  if (!isNonEmptyString(lease.ownerId)) return false;
  if (!Number.isInteger(lease.fencingToken) || (lease.fencingToken as number) <= 0) return false;
  if (!isNonEmptyString(lease.acquiredAt) || !isNonEmptyString(lease.expiresAt)) return false;

  const acquiredAtMs = Date.parse(lease.acquiredAt);
  const expiresAtMs = Date.parse(lease.expiresAt);
  return Number.isFinite(acquiredAtMs)
    && Number.isFinite(expiresAtMs)
    && expiresAtMs > acquiredAtMs;
}
