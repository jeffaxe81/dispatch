import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function controlOwnWorkShiftSource() {
  const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function controlOwnWorkShift");
  if (start < 0) return "";
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport < 0 ? source.length : nextExport);
}

describe("D-007A transactional work shift adapter contract", () => {
  it("mantém lock por usuário e toda escrita histórica na mesma transaction", () => {
    const block = controlOwnWorkShiftSource();

    expect(block).toContain("export async function controlOwnWorkShift");
    expect(block).toContain("db.transaction");
    expect(block).toContain('.for("update")');
    expect(block).toContain("executeOwnWorkShiftAction");
    expect(block).toContain("tx.insert(workShiftSessions)");
    expect(block).toContain("tx.insert(workShiftEvents)");
    expect(block).toContain("tx.update(teams)");

    const lockIndex = block.indexOf('.for("update")');
    const orchestrationIndex = block.indexOf("executeOwnWorkShiftAction");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(orchestrationIndex).toBeGreaterThan(lockIndex);
  });
});
