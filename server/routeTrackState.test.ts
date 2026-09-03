import { describe, expect, it } from "vitest";
import {
  buildRouteTrackPoint,
  closeRouteTrack,
} from "./routeTrackState";

describe("CP-016 route track state", () => {
  it("links track points to existing team locations without duplicating coordinates", () => {
    expect(
      buildRouteTrackPoint({
        routeTrackId: 10,
        teamLocationId: 300,
        previousSequence: 4,
      }),
    ).toEqual({ routeTrackId: 10, teamLocationId: 300, sequence: 5 });
  });

  it("starts point sequence at one", () => {
    expect(
      buildRouteTrackPoint({ routeTrackId: 10, teamLocationId: 300, previousSequence: null }),
    ).toEqual({ routeTrackId: 10, teamLocationId: 300, sequence: 1 });
  });

  it("rejects invalid location references", () => {
    expect(() =>
      buildRouteTrackPoint({ routeTrackId: 10, teamLocationId: 0, previousSequence: null }),
    ).toThrow("localização");
  });

  it("closes a track with duration and final status", () => {
    const startedAt = new Date("2026-09-03T10:00:00.000Z");
    const endedAt = new Date("2026-09-03T10:12:30.000Z");
    expect(closeRouteTrack({ startedAt, endedAt, distanceMeters: 4250 })).toEqual({
      status: "completed",
      endedAt,
      durationSeconds: 750,
      distanceMeters: 4250,
    });
  });

  it("rejects a track ending before it started", () => {
    expect(() =>
      closeRouteTrack({
        startedAt: new Date("2026-09-03T11:00:00.000Z"),
        endedAt: new Date("2026-09-03T10:00:00.000Z"),
        distanceMeters: 100,
      }),
    ).toThrow("anterior");
  });
});
