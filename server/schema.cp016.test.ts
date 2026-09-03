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
} from "../drizzle/schema.cp016";

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

  it("stores the current pause marker required by the work-session state machine", () => {
    expect(workSessions.pausedAt).toBeDefined();
  });
});
