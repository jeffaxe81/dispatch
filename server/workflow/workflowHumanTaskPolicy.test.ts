import { describe, expect, it } from "vitest";
import {
  assertLegacyExecutorSupportsDefinition,
  definitionRequiresHumanTask,
} from "./workflowHumanTaskPolicy";

describe("D-012D human task execution policy", () => {
  it("detecta etapa humana somente quando requiresHumanTask e true", () => {
    expect(definitionRequiresHumanTask({
      nodes: [
        { id: "a", configuration: { requiresHumanTask: false } },
        { id: "b", configuration: { requiresHumanTask: true } },
      ],
    })).toBe(true);

    expect(definitionRequiresHumanTask({
      nodes: [{ id: "a", configuration: { requiresHumanTask: false } }],
    })).toBe(false);
  });

  it("impede executor legado de ignorar uma etapa humana", () => {
    expect(() => assertLegacyExecutorSupportsDefinition({
      nodes: [{ id: "human", configuration: { requiresHumanTask: true } }],
    })).toThrow("engine stateful");

    expect(() => assertLegacyExecutorSupportsDefinition({
      nodes: [{ id: "normal", configuration: {} }],
    })).not.toThrow();
  });
});
