import { describe, expect, it } from "vitest";
import {
  shiftTemplates,
  shiftSchedules,
  workSessions,
  workSessionEvents,
  operationalPresence,
  routeTracks,
  routeTrackPoints,
  embeddedIntegrations,
} from "../drizzle/cp016Schema";

describe("CP-016 database schema", () => {
  it("exports all additive CP-016 tables", () => {
    expect(shiftTemplates).toBeDefined();
    expect(shiftSchedules).toBeDefined();
    expect(workSessions).toBeDefined();
    expect(workSessionEvents).toBeDefined();
    expect(operationalPresence).toBeDefined();
    expect(routeTracks).toBeDefined();
    expect(routeTrackPoints).toBeDefined();
    expect(embeddedIntegrations).toBeDefined();
  });
});
