import { describe, expect, it } from "vitest";
import {
  INTEGRATION_CONTRACTS,
  assertIntegrationContractCompatibility,
  getIntegrationContract,
} from "../shared/integrationContracts";

describe("D-012J J9 — contratos versionados de integração", () => {
  it("publica contratos v1 explícitos para NEO, Inventário/Ativos e CRM", () => {
    expect(Object.keys(INTEGRATION_CONTRACTS).sort()).toEqual(["crm", "inventory", "neo"]);
    expect(INTEGRATION_CONTRACTS.neo).toMatchObject({
      system: "neo",
      version: 1,
      owner: "neo",
      databaseWriteAllowed: false,
    });
    expect(INTEGRATION_CONTRACTS.inventory).toMatchObject({
      system: "inventory",
      version: 1,
      owner: "inventory",
      databaseWriteAllowed: false,
    });
    expect(INTEGRATION_CONTRACTS.crm).toMatchObject({
      system: "crm",
      version: 1,
      owner: "crm",
      databaseWriteAllowed: false,
    });
  });

  it("mantém o Dispatch como consumidor por contrato sem assumir ownership do sistema externo", () => {
    for (const contract of Object.values(INTEGRATION_CONTRACTS)) {
      expect(contract.consumer).toBe("dispatch");
      expect(contract.databaseWriteAllowed).toBe(false);
      expect(contract.allowedIntegrationModes).toEqual(expect.arrayContaining(["api", "event"]));
    }
  });

  it("resolve somente sistemas e versões declarados", () => {
    expect(getIntegrationContract("neo", 1)).toEqual(INTEGRATION_CONTRACTS.neo);
    expect(getIntegrationContract("crm", 2)).toBeNull();
    expect(getIntegrationContract("unknown", 1)).toBeNull();
  });

  it("aceita a mesma versão e falha fechado em versão incompatível", () => {
    expect(assertIntegrationContractCompatibility({ system: "inventory", requestedVersion: 1 })).toEqual(INTEGRATION_CONTRACTS.inventory);
    expect(() => assertIntegrationContractCompatibility({ system: "inventory", requestedVersion: 2 })).toThrow(/versão|compat/i);
    expect(() => assertIntegrationContractCompatibility({ system: "unknown", requestedVersion: 1 })).toThrow(/contrato|integração/i);
  });
});
