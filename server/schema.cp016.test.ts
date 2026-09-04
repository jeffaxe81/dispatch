import { getTableName } from "drizzle-orm";
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

  it("keeps stable physical table names for migration generation", () => {
    expect([
      getTableName(shiftTemplates),
      getTableName(shiftSchedules),
      getTableName(workSessions),
      getTableName(workSessionEvents),
      getTableName(operationalPresence),
      getTableName(routeTracks),
      getTableName(routeTrackPoints),
      getTableName(embeddedIntegrations),
    ]).toEqual([
      "shift_templates",
      "shift_schedules",
      "work_sessions",
      "work_session_events",
      "operational_presence",
      "route_tracks",
      "route_track_points",
      "embedded_integrations",
    ]);
  });
});
