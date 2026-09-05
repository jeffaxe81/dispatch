import { describe, expect, it } from "vitest";
import { resolveOperationalPresenceState } from "./operationalPresence";

const base = {
  inShift: true,
  shiftPaused: false,
  teamStatus: "disponivel" as const,
};

describe("operational presence materialization", () => {
  it("marks an available team in shift as dispatchable", () => {
    expect(resolveOperationalPresenceState(base)).toEqual({
      status: "available",
      availableForDispatch: true,
    });
  });

  it("marks an explicitly paused team as not dispatchable", () => {
    expect(resolveOperationalPresenceState({ ...base, teamStatus: "pausada" })).toEqual({
      status: "paused",
      availableForDispatch: false,
    });
  });

  it("marks a paused work session as not dispatchable even if the team snapshot is available", () => {
    expect(resolveOperationalPresenceState({ ...base, shiftPaused: true })).toEqual({
      status: "paused",
      availableForDispatch: false,
    });
  });

  it("marks a team in service or displacement as busy", () => {
    expect(resolveOperationalPresenceState({ ...base, teamStatus: "em_atendimento" })).toEqual({
      status: "busy",
      availableForDispatch: false,
    });
    expect(resolveOperationalPresenceState({ ...base, teamStatus: "em_deslocamento" })).toEqual({
      status: "busy",
      availableForDispatch: false,
    });
  });

  it("marks an unavailable team as offline", () => {
    expect(resolveOperationalPresenceState({ ...base, teamStatus: "indisponivel" })).toEqual({
      status: "offline",
      availableForDispatch: false,
    });
  });

  it("gives out-of-shift precedence over pause and current team status", () => {
    expect(resolveOperationalPresenceState({ ...base, inShift: false, shiftPaused: true })).toEqual({
      status: "out_of_shift",
      availableForDispatch: false,
    });
  });
});
