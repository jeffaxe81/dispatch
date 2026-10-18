import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../dbLegacy", () => ({ getDb }));
import { confirmWorkflowSlaI5dHomologation } from "./workflowSlaNotificationMySql";

const input = {
  intentId: 44,
  organizationId: 9,
  expectedVersion: 1,
  workerId: "test-worker",
  leaseToken: "test-token",
  operatorApproved: true,
};
beforeEach(() => {
  getDb.mockReset();
  vi.stubEnv("AXE_RUNTIME_ENV", "homologation");
  vi.stubEnv("AXE_SLA_I5D_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("I5D — composição interna de homologação", () => {
  it.each(["production", "development", ""])(
    "ambiente %s bloqueia antes da conexão",
    async runtime => {
      vi.stubEnv("AXE_RUNTIME_ENV", runtime);
      await expect(confirmWorkflowSlaI5dHomologation(input)).rejects.toThrow(
        /desabilitada/
      );
      expect(getDb).not.toHaveBeenCalled();
    }
  );
  it("flag ausente bloqueia antes da conexão", async () => {
    vi.stubEnv("AXE_SLA_I5D_ENABLED", "");
    await expect(confirmWorkflowSlaI5dHomologation(input)).rejects.toThrow(
      /desabilitada/
    );
    expect(getDb).not.toHaveBeenCalled();
  });
  it("sessão não aprovada bloqueia antes da conexão", async () => {
    await expect(
      confirmWorkflowSlaI5dHomologation({ ...input, operatorApproved: false })
    ).rejects.toThrow();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("banco indisponível falha sem afirmar entrega", async () => {
    getDb.mockResolvedValue(null);
    await expect(confirmWorkflowSlaI5dHomologation(input)).rejects.toThrow(
      /Banco indisponível/
    );
    expect(getDb).toHaveBeenCalledOnce();
  });
});
