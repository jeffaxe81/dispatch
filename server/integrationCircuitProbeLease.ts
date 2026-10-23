import type { IntegrationSystem } from "../shared/integrationContracts";

export type IntegrationCircuitProbeLeaseSnapshot = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  circuitState: "closed" | "open" | "half_open";
  circuitVersion: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
}>;

export type IntegrationCircuitProbeLeasePlan =
  IntegrationCircuitProbeLeaseSnapshot & Readonly<{ permitsProbe: false }>;

const MAX_EPOCH_MS = 8_640_000_000_000_000;

function positiveInt(value: number, label: string, min = 1): void {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(label + " inválido.");
}
function epoch(value: number | null, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPOCH_MS)) {
    throw new Error(label + " inválido.");
  }
}
function requiredText(value: string, label: string, max: number): void {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(label + " inválido.");
  }
}

export function assertIntegrationCircuitProbeLeaseSnapshot(
  snapshot: IntegrationCircuitProbeLeaseSnapshot,
): void {
  positiveInt(snapshot.organizationId, "Organização");
  if (!["neo", "inventory", "crm"].includes(snapshot.system)) throw new Error("Sistema inválido.");
  if (!["closed", "open", "half_open"].includes(snapshot.circuitState)) {
    throw new Error("Estado do circuito inválido.");
  }
  positiveInt(snapshot.circuitVersion, "Versão do circuito", 0);
  epoch(snapshot.leaseExpiresAtMs, "Expiração do lease");

  const values = [snapshot.leaseOwner, snapshot.leaseToken, snapshot.leaseExpiresAtMs];
  const present = values.filter(v => v !== null).length;
  if (present !== 0 && present !== 3) throw new Error("Lease de probe parcial ou inconsistente.");
  if (present === 3) {
    requiredText(snapshot.leaseOwner as string, "Lease owner", 120);
    requiredText(snapshot.leaseToken as string, "Lease token", 160);
    if ((snapshot.leaseExpiresAtMs as number) <= 0) throw new Error("Lease de probe inválido.");
  }
}

function bump(version: number): number {
  if (version >= Number.MAX_SAFE_INTEGER) throw new Error("Versão do circuito esgotada.");
  return version + 1;
}

export function buildIntegrationCircuitProbeLeaseClaim(
  current: IntegrationCircuitProbeLeaseSnapshot,
  input: {
    nowEpochMs: number;
    leaseOwner: string;
    leaseToken: string;
    leaseDurationMs: number;
  },
): IntegrationCircuitProbeLeasePlan {
  assertIntegrationCircuitProbeLeaseSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  requiredText(input.leaseOwner, "Lease owner", 120);
  requiredText(input.leaseToken, "Lease token", 160);
  positiveInt(input.leaseDurationMs, "Duração do lease");
  if (current.circuitState !== "half_open") {
    throw new Error("Lease de probe exige circuito half-open.");
  }
  if (current.leaseExpiresAtMs !== null && current.leaseExpiresAtMs > input.nowEpochMs) {
    throw new Error("Já existe lease de probe ativo.");
  }
  const expiresAt = input.nowEpochMs + input.leaseDurationMs;
  epoch(expiresAt, "Expiração do lease");
  return Object.freeze({
    ...current,
    circuitVersion: bump(current.circuitVersion),
    leaseOwner: input.leaseOwner,
    leaseToken: input.leaseToken,
    leaseExpiresAtMs: expiresAt,
    permitsProbe: false as const,
  });
}

export function buildIntegrationCircuitProbeLeaseRelease(
  current: IntegrationCircuitProbeLeaseSnapshot,
  input: { nowEpochMs: number; expectedVersion: number; leaseToken: string },
): IntegrationCircuitProbeLeasePlan {
  assertIntegrationCircuitProbeLeaseSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  positiveInt(input.expectedVersion, "Versão esperada", 0);
  requiredText(input.leaseToken, "Lease token", 160);
  if (current.circuitState !== "half_open") throw new Error("Liberação exige circuito half-open.");
  if (current.circuitVersion !== input.expectedVersion) throw new Error("Versão CAS do circuito divergente.");
  if (current.leaseToken !== input.leaseToken) throw new Error("Token de fencing divergente.");
  if (current.leaseExpiresAtMs === null || input.nowEpochMs >= current.leaseExpiresAtMs) {
    throw new Error("Lease expirado não pode ser liberado por worker obsoleto.");
  }
  return Object.freeze({
    ...current,
    circuitVersion: bump(current.circuitVersion),
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAtMs: null,
    permitsProbe: false as const,
  });
}
