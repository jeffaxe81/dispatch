import { describe, expect, it } from "vitest";
import { configurableDashboardMetricKeys, normalizeDashboardMetricKeys } from "./ConfigurableDashboardWidget";

describe("D-010C ConfigurableDashboardWidget", () => {
  it("remove métricas desconhecidas e duplicadas", () => {
    expect(normalizeDashboardMetricKeys(["activeIncidents", "evil.metric", "activeIncidents", "availableTeams"])).toEqual([
      "activeIncidents",
      "availableTeams",
    ]);
  });

  it("usa o conjunto fechado seguro quando metricKeys é omitido ou vazio", () => {
    expect(normalizeDashboardMetricKeys(undefined)).toEqual([...configurableDashboardMetricKeys]);
    expect(normalizeDashboardMetricKeys([])).toEqual([...configurableDashboardMetricKeys]);
  });
});
