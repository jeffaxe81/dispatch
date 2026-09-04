import { describe, expect, it } from "vitest";
import { resolveOperationalPresenceState } from "./operationalPresence";

const base = {
  inShift: true,
  teamStatus: "disponivel" as const,
};

describe("operational presence materialization", () => {
  it("marks an available team in shift as dispatchable", () => {
    expect(resolveOperationalPresenceState(base)).toEqual({
      status: "available",
      availableForDispatch: true,
    });
  });

  it("marks a paused team as not dispatchable", () => {
    expect(resolveOperationalPresenceState({ ...base, teamStatus: "pausada" })).toEqual({
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

  it("gives out-of-shift precedence over the current team status", () => {
    expect(resolveOperationalPresenceState({ ...base, inShift: false })).toEqual({
      status: "out_of_shift",
      availableForDispatch: false,
    });
  });
});
