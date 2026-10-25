import type { IntegrationSystem } from "../shared/integrationContracts";

export type IntegrationCircuitSnapshot = Readonly<{
  organizationId: number;
  system: IntegrationSystem;
  state: "closed" | "open" | "half_open";
  version: number;
  consecutiveFailures: number;
  openedAtMs: number | null;
  cooldownUntilMs: number | null;
}>;

export type IntegrationCircuitHalfOpenPlan = IntegrationCircuitSnapshot & Readonly<{
  permitsProbe: false;
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

export function assertIntegrationCircuitSnapshot(
  snapshot: IntegrationCircuitSnapshot,
): void {
  integer(snapshot.organizationId, "Organização", 1);
  if (!["neo", "inventory", "crm"].includes(snapshot.system)) throw new Error("Sistema inválido.");
  if (!["closed", "open", "half_open"].includes(snapshot.state)) throw new Error("Estado do circuito inválido.");
  integer(snapshot.version, "Versão");
  integer(snapshot.consecutiveFailures, "Falhas consecutivas");
  epoch(snapshot.openedAtMs, "Abertura do circuito");
  epoch(snapshot.cooldownUntilMs, "Fim do cooldown");

  if (snapshot.state === "closed") {
    if (snapshot.openedAtMs !== null || snapshot.cooldownUntilMs !== null) {
      throw new Error("Circuito fechado não pode manter janela de abertura.");
    }
    return;
  }
  if (snapshot.openedAtMs === null || snapshot.cooldownUntilMs === null
    || snapshot.cooldownUntilMs <= snapshot.openedAtMs) {
    throw new Error("Circuito aberto/half-open exige janela de cooldown válida.");
  }
}

function nextVersion(current: IntegrationCircuitSnapshot): number {
  if (current.version >= Number.MAX_SAFE_INTEGER) throw new Error("Versão do circuito esgotada.");
  return current.version + 1;
}

export function buildIntegrationCircuitFailure(
  current: IntegrationCircuitSnapshot,
  input: { nowEpochMs: number; failureThreshold: number; cooldownSeconds: number },
): IntegrationCircuitSnapshot {
  assertIntegrationCircuitSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  integer(input.failureThreshold, "Limiar", 1);
  integer(input.cooldownSeconds, "Cooldown", 1);
  const failures = current.consecutiveFailures + 1;
  integer(failures, "Falhas consecutivas");

  if (current.state !== "closed") {
    throw new Error("Falha normal só pode atualizar circuito fechado; half-open exige lease J27.");
  }
  if (failures < input.failureThreshold) {
    return Object.freeze({ ...current, version: nextVersion(current), consecutiveFailures: failures });
  }
  const cooldownUntilMs = input.nowEpochMs + input.cooldownSeconds * 1_000;
  epoch(cooldownUntilMs, "Fim do cooldown");
  return Object.freeze({
    ...current,
    state: "open",
    version: nextVersion(current),
    consecutiveFailures: failures,
    openedAtMs: input.nowEpochMs,
    cooldownUntilMs,
  });
}

export function buildIntegrationCircuitCooldownExpiry(
  current: IntegrationCircuitSnapshot,
  nowEpochMs: number,
): IntegrationCircuitHalfOpenPlan {
  assertIntegrationCircuitSnapshot(current);
  epoch(nowEpochMs, "Relógio");
  if (current.state !== "open") throw new Error("Somente circuito open pode entrar em half-open.");
  if (current.cooldownUntilMs === null || nowEpochMs < current.cooldownUntilMs) {
    throw new Error("Cooldown ainda não expirou.");
  }
  return Object.freeze({
    ...current,
    state: "half_open",
    version: nextVersion(current),
    permitsProbe: false as const,
  });
}

export function buildIntegrationCircuitSuccess(
  current: IntegrationCircuitSnapshot,
  nowEpochMs: number,
): IntegrationCircuitSnapshot {
  assertIntegrationCircuitSnapshot(current);
  epoch(nowEpochMs, "Relógio");
  if (current.state !== "half_open") throw new Error("Fechamento exige circuito half-open.");
  return Object.freeze({
    ...current,
    state: "closed",
    version: nextVersion(current),
    consecutiveFailures: 0,
    openedAtMs: null,
    cooldownUntilMs: null,
  });
}

export function buildIntegrationCircuitProbeFailure(
  current: IntegrationCircuitSnapshot,
  input: { nowEpochMs: number; cooldownSeconds: number },
): IntegrationCircuitSnapshot {
  assertIntegrationCircuitSnapshot(current);
  epoch(input.nowEpochMs, "Relógio");
  integer(input.cooldownSeconds, "Cooldown", 1);
  if (current.state !== "half_open") throw new Error("Falha de probe exige circuito half-open.");
  const failures = current.consecutiveFailures + 1;
  integer(failures, "Falhas consecutivas");
  const cooldownUntilMs = input.nowEpochMs + input.cooldownSeconds * 1_000;
  epoch(cooldownUntilMs, "Fim do cooldown");
  return Object.freeze({
    ...current,
    state: "open",
    version: nextVersion(current),
    consecutiveFailures: failures,
    openedAtMs: input.nowEpochMs,
    cooldownUntilMs,
  });
}
