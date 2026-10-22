export type IntegrationSystem = "neo" | "inventory" | "crm";
export type IntegrationMode = "api" | "event";

export type IntegrationContract = {
  system: IntegrationSystem;
  version: 1;
  owner: IntegrationSystem;
  consumer: "dispatch";
  databaseWriteAllowed: false;
  allowedIntegrationModes: readonly IntegrationMode[];
};

export const INTEGRATION_CONTRACTS: Record<IntegrationSystem, IntegrationContract> = {
  neo: {
    system: "neo",
    version: 1,
    owner: "neo",
    consumer: "dispatch",
    databaseWriteAllowed: false,
    allowedIntegrationModes: ["api", "event"],
  },
  inventory: {
    system: "inventory",
    version: 1,
    owner: "inventory",
    consumer: "dispatch",
    databaseWriteAllowed: false,
    allowedIntegrationModes: ["api", "event"],
  },
  crm: {
    system: "crm",
    version: 1,
    owner: "crm",
    consumer: "dispatch",
    databaseWriteAllowed: false,
    allowedIntegrationModes: ["api", "event"],
  },
};

export function getIntegrationContract(system: string, version: number): IntegrationContract | null {
  if (version !== 1) return null;
  if (system !== "neo" && system !== "inventory" && system !== "crm") return null;
  return INTEGRATION_CONTRACTS[system];
}

export function assertIntegrationContractCompatibility(input: {
  system: string;
  requestedVersion: number;
}): IntegrationContract {
  const contract = getIntegrationContract(input.system, input.requestedVersion);
  if (!contract) {
    if (input.system === "neo" || input.system === "inventory" || input.system === "crm") {
      throw new Error(`Versão incompatível para integração ${input.system}: v${input.requestedVersion}.`);
    }
    throw new Error(`Contrato de integração não declarado: ${input.system}.`);
  }
  return contract;
}
