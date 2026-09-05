import { describe, expect, it } from "vitest";
import { assertWorkShiftAlertScope } from "./workShiftAlertsRuntime";

const scopedActor = {
  userId: 10,
  organizationId: 20,
  organizationalUnitId: 30,
  permissions: ["work_shift_alerts.view"],
};

describe("D-007D3 work shift alerts runtime scope", () => {
  it("aceita o mesmo escopo organizacional e de unidade", () => {
    expect(() => assertWorkShiftAlertScope(scopedActor, {
      organizationId: 20,
      organizationalUnitId: 30,
    })).not.toThrow();
  });

  it("falha fechado quando o alerta está fora do escopo", () => {
    expect(() => assertWorkShiftAlertScope(scopedActor, {
      organizationId: 20,
      organizationalUnitId: 31,
    })).toThrow(/fora da unidade organizacional autorizada/i);
  });

  it("falha fechado quando o escopo não pode ser resolvido", () => {
    expect(() => assertWorkShiftAlertScope(scopedActor, {
      organizationId: null,
      organizationalUnitId: null,
    })).toThrow(/não pôde ser resolvido/i);
  });
});
