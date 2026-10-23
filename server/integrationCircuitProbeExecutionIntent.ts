import type { IntegrationSystem } from "../shared/integrationContracts";

export type IntegrationProbeExecutionSnapshot = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  circuitState: "closed" | "open" | "half_open";
  circuitVersion: number;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAtMs: number | null;
  executionToken: string | null;
  executionExpiresAtMs: number | null;
  executionConsumedAtMs: number | null;
}>;

export type IntegrationProbeExecutionPlan = IntegrationProbeExecutionSnapshot & Readonly<{
  permitsProbe: boolean;
  permitsExternalCall: false;
  permitsAutomaticReplay: false;
}>;

const MAX_EPOCH_MS = 8_640_000_000_000_000;

function integer(value: number, label: string, min = 0): void {
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
function nextVersion(version: number): number {
  if (version >= Number.MAX_SAFE_INTEGER) throw new Error("Versão do circuito esgotada.");
  return version + 1;
}

export function assertIntegrationProbeExecutionSnapshot(snapshot: IntegrationProbeExecutionSnapshot): void {
  integer(snapshot.organizationId, "Organização", 1);
  if (!["neo", "inventory", "crm"].includes(snapshot.system)) throw new Error("Sistema inválido.");
  if (!["closed", "open", "half_open"].includes(snapshot.circuitState)) throw new Error("Estado do circuito inválido.");
  integer(snapshot.circuitVersion, "Versão do circuito");
  epoch(snapshot.leaseExpiresAtMs, "Expiração do lease");
  epoch(snapshot.executionExpiresAtMs, "Expiração da intenção");
  epoch(snapshot.executionConsumedAtMs, "Consumo da intenção");

  const lease = [snapshot.leaseOwner, snapshot.leaseToken, snapshot.leaseExpiresAtMs];
  const leasePresent = lease.filter(value => value !== null).length;
  if (leasePresent !== 0 && leasePresent !== 3) throw new Error("Lease de probe parcial ou inconsistente.");
  if (leasePresent === 3) {
    requiredText(snapshot.leaseOwner as string, "Lease owner", 120);
    requiredText(snapshot.leaseToken as string, "Lease token", 160);
  }

  const intentPair = [snapshot.executionToken, snapshot.executionExpiresAtMs];
  const intentPresent = intentPair.filter(value => value !== null).length;
  if (intentPresent !== 0 && intentPresent !== 2) throw new Error("Intenção de probe parcial ou inconsistente.");
  if (snapshot.executionConsumedAtMs !== null && intentPresent !== 2) {
    throw new Error("Consumo de probe sem intenção persistida.");
  }
  if (intentPresent === 2) {
    requiredText(snapshot.executionToken as string, "Execution token", 160);
    if (snapshot.circuitState !== "half_open" || leasePresent !== 3) {
      throw new Error("Intenção de probe exige circuito half-open com lease ativo.");
    }
    if ((snapshot.executionExpiresAtMs as number) > (snapshot.leaseExpiresAtMs as number)) {
      throw new Error("Intenção de probe não pode expirar após o lease.");
    }
  }
}

export function buildProbeExecutionIntent(
  current: IntegrationProbeExecutionSnapshot,
  input: {
    nowEpochMs: number;
    expectedVersion: number;
    leaseToken: string;
    executionToken: string;
    executionDurationMs: number;
  },
): IntegrationProbeExecutionPlan {
  assertIntegrationProbeExecutionSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  integer(input.expectedVersion, "Versão esperada");
  requiredText(input.leaseToken, "Lease token", 160);
  requiredText(input.executionToken, "Execution token", 160);
  integer(input.executionDurationMs, "Duração da intenção", 1);

  if (current.circuitState !== "half_open") throw new Error("Intenção de probe exige circuito half-open.");
  if (current.circuitVersion !== input.expectedVersion) throw new Error("Versão CAS divergente.");
  if (current.leaseToken !== input.leaseToken) throw new Error("Token de fencing divergente.");
  if (current.leaseExpiresAtMs === null || input.nowEpochMs >= current.leaseExpiresAtMs) {
    throw new Error("Lease de probe expirado.");
  }
  if (current.executionToken !== null) {
    throw new Error("Lease já possui intenção one-shot de probe.");
  }

  const expiresAt = input.nowEpochMs + input.executionDurationMs;
  epoch(expiresAt, "Expiração da intenção");
  if (expiresAt > current.leaseExpiresAtMs) {
    throw new Error("Intenção de probe expira após o lease.");
  }

  return Object.freeze({
    ...current,
    circuitVersion: nextVersion(current.circuitVersion),
    executionToken: input.executionToken,
    executionExpiresAtMs: expiresAt,
    executionConsumedAtMs: null,
    permitsProbe: false,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}

export function consumeProbeExecutionIntent(
  current: IntegrationProbeExecutionSnapshot,
  input: {
    nowEpochMs: number;
    expectedVersion: number;
    leaseToken: string;
    executionToken: string;
  },
): IntegrationProbeExecutionPlan {
  assertIntegrationProbeExecutionSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  integer(input.expectedVersion, "Versão esperada");
  requiredText(input.leaseToken, "Lease token", 160);
  requiredText(input.executionToken, "Execution token", 160);

  if (current.circuitState !== "half_open") throw new Error("Consumo exige circuito half-open.");
  if (current.circuitVersion !== input.expectedVersion) throw new Error("Versão CAS divergente.");
  if (current.leaseToken !== input.leaseToken) throw new Error("Token de fencing divergente.");
  if (current.executionToken !== input.executionToken) throw new Error("Token one-shot divergente.");
  if (current.executionConsumedAtMs !== null) throw new Error("Intenção one-shot já consumida.");
  if (current.leaseExpiresAtMs === null || input.nowEpochMs >= current.leaseExpiresAtMs) {
    throw new Error("Lease de probe expirado.");
  }
  if (current.executionExpiresAtMs === null || input.nowEpochMs >= current.executionExpiresAtMs) {
    throw new Error("Intenção de probe expirada.");
  }

  return Object.freeze({
    ...current,
    circuitVersion: nextVersion(current.circuitVersion),
    executionConsumedAtMs: input.nowEpochMs,
    permitsProbe: true,
    permitsExternalCall: false,
    permitsAutomaticReplay: false,
  });
}
