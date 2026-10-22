import {
  assertIntegrationContractCompatibility,
  type IntegrationMode,
  type IntegrationSystem,
} from "./integrationContracts";

export type IntegrationConformanceStatus = "conformant" | "degraded";
export type IntegrationCoreDisposition = "continue";

export type IntegrationConformanceResult = {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: 1;
  mode: IntegrationMode;
  status: IntegrationConformanceStatus;
  coreDisposition: IntegrationCoreDisposition;
  externalAvailable: boolean;
};

function assertTenantId(tenantId: number): void {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error("Tenant inválido para harness de integração.");
  }
}

function requiredIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Chave de idempotência é obrigatória para o harness de integração.");
  }
  return normalized;
}

function assertMode(mode: unknown): asserts mode is IntegrationMode {
  if (mode !== "api" && mode !== "event") {
    throw new Error("Modo de integração inválido.");
  }
}

export function runIntegrationConformanceCheck(input: {
  tenantId: number;
  system: IntegrationSystem;
  contractVersion: number;
  mode: IntegrationMode;
  idempotencyKey: string;
  externalAvailable: boolean;
}): IntegrationConformanceResult {
  assertTenantId(input.tenantId);
  requiredIdempotencyKey(input.idempotencyKey);
  assertMode(input.mode);

  const contract = assertIntegrationContractCompatibility({
    system: input.system,
    requestedVersion: input.contractVersion,
  });

  if (!contract.allowedIntegrationModes.includes(input.mode)) {
    throw new Error(`Modo de integração não permitido para ${input.system}.`);
  }

  return {
    tenantId: input.tenantId,
    system: contract.system,
    contractVersion: contract.version,
    mode: input.mode,
    status: input.externalAvailable ? "conformant" : "degraded",
    coreDisposition: "continue",
    externalAvailable: input.externalAvailable,
  };
}
