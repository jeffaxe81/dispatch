import { describe, expect, it } from "vitest";
import {
  deriveOperationalPresence,
  isPresenceDispatchable,
} from "./operationalPresence";

describe("CP-016 operational presence", () => {
  it("marks a team available only when it is in shift and operationally available", () => {
    expect(
      deriveOperationalPresence({
        inShift: true,
        shiftPaused: false,
        teamStatus: "disponivel",
        hasActiveIncident: false,
        online: true,
      }),
    ).toEqual({ status: "available", availableForDispatch: true });
  });

  it("marks a paused shift as paused and not dispatchable", () => {
    expect(
      deriveOperationalPresence({
        inShift: true,
        shiftPaused: true,
        teamStatus: "disponivel",
        hasActiveIncident: false,
        online: true,
      }),
    ).toEqual({ status: "paused", availableForDispatch: false });
  });

  it("marks a team with an active incident as busy", () => {
    expect(
      deriveOperationalPresence({
        inShift: true,
        shiftPaused: false,
        teamStatus: "em_atendimento",
        hasActiveIncident: true,
        online: true,
      }),
    ).toEqual({ status: "busy", availableForDispatch: false });
  });

  it("prioritizes out-of-shift over online status", () => {
    expect(
      deriveOperationalPresence({
        inShift: false,
        shiftPaused: false,
        teamStatus: "disponivel",
        hasActiveIncident: false,
        online: true,
      }),
    ).toEqual({ status: "out_of_shift", availableForDispatch: false });
  });

  it("marks an in-shift disconnected team as offline", () => {
    expect(
      deriveOperationalPresence({
        inShift: true,
        shiftPaused: false,
        teamStatus: "disponivel",
        hasActiveIncident: false,
        online: false,
      }),
    ).toEqual({ status: "offline", availableForDispatch: false });
  });

  it("treats only available presence as dispatchable", () => {
    expect(isPresenceDispatchable("available")).toBe(true);
    expect(isPresenceDispatchable("busy")).toBe(false);
    expect(isPresenceDispatchable("paused")).toBe(false);
    expect(isPresenceDispatchable("offline")).toBe(false);
    expect(isPresenceDispatchable("out_of_shift")).toBe(false);
  });
});
