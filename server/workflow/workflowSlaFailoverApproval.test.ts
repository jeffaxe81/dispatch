import { describe, expect, it } from "vitest";
import {
  signSlaFailoverApproval, verifySlaFailoverApproval,
} from "./workflowSlaFailoverApproval";

const secret = "approval-secret-j6g-".repeat(3);
const issuedAt = "2026-10-22T23:00:00.000Z";
const expiresAt = "2026-10-22T23:04:00.000Z";
const now = "2026-10-22T23:02:00.000Z";
const original = {
  version: "j6g-v1" as const, organizationId: 9,
  component: "scheduler" as const, operatorUserId: 11,
  approverUserId: 22, approvalId: "ab".repeat(16),
  issuedAt, expiresAt,
};
const signed = () => signSlaFailoverApproval(original, secret);
const verify = (approval = signed()) => verifySlaFailoverApproval({
  approval, operatorUserId: 11, organizationId: 9,
  component: "scheduler", now, secret,
});

describe("J6G — aprovação independente de failover", () => {
  it("aceita token válido e somente retorna referência irreversível", () => {
    const result = verify();
    expect(result).toEqual({ approverUserId: 22, approvalRef: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(signed().signature);
  });

  it("nega autoaprovação, aprovação antiga/futura e duração excessiva", () => {
    expect(() => signSlaFailoverApproval({
      ...original, approverUserId: 11,
    }, secret)).toThrow(/inválida/);
    expect(() => signSlaFailoverApproval({
      ...original, expiresAt: "2026-10-22T23:06:00.001Z",
    }, secret)).toThrow(/inválida/);
    expect(() => verifySlaFailoverApproval({
      approval: signed(), operatorUserId: 11, organizationId: 9,
      component: "scheduler", now: "2026-10-22T23:04:00.001Z", secret,
    })).toThrow(/inválida/);
    expect(() => verifySlaFailoverApproval({
      approval: signed(), operatorUserId: 11, organizationId: 9,
      component: "scheduler", now: "2026-10-22T22:59:59.999Z", secret,
    })).toThrow(/inválida/);
  });

  it("rejeita adulteração do tenant, ação, aprovador, operador e assinatura", () => {
    const token = signed();
    for (const edited of [
      { ...token, organizationId: 10 },
      { ...token, component: "adapter" as const },
      { ...token, operatorUserId: 18 },
      { ...token, approverUserId: 19 },
      { ...token, approvalId: "cd".repeat(16) },
      { ...token, signature: "0".repeat(64) },
    ]) expect(() => verify(edited)).toThrow(/inválida/);
    expect(() => verifySlaFailoverApproval({
      approval: token, operatorUserId: 19, organizationId: 9,
      component: "scheduler", now, secret,
    })).toThrow(/inválida/);
    expect(() => verifySlaFailoverApproval({
      approval: token, operatorUserId: 11, organizationId: 10,
      component: "scheduler", now, secret,
    })).toThrow(/inválida/);
    expect(() => signSlaFailoverApproval(original, "short")).toThrow(/inválida/);
  });
});
