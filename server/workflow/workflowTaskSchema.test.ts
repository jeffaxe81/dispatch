import { describe, expect, it } from "vitest";
import * as schema from "../../drizzle/schema";

describe("D-012D workflow task schema", () => {
  it("expõe workflowTasks sem criar uma segunda tabela de instâncias", () => {
    expect("workflowTasks" in schema).toBe(true);
    expect("workflowInstances" in schema).toBe(false);
  });
});
