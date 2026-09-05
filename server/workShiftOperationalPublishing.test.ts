import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkShiftStore } from "./workShiftService";

const anomalyMocks = vi.hoisted(() => ({ publishWorkShiftOperationalEvent: vi.fn(async () => undefined) }));
vi.mock("./workShiftAnomalyService", () => anomalyMocks);

import { executeOwnWorkShiftAction } from "./workShiftService";

describe("D-007A -> D-007D operational publication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publica para D-007D somente depois de persistir o evento D-007A", async () => {
    const order: string[] = [];
    const appendEvent = vi.fn(async () => { order.push("persisted"); });
    anomalyMocks.publishWorkShiftOperationalEvent.mockImplementationOnce(async event => {
      order.push("published");
      expect(event).toMatchObject({ tenantId: 7, userId: 42, teamId: 3, sessionId: 101, eventType: "started" });
    });
    const store: WorkShiftStore = {
      getOpenSession: vi.fn(async () => null),
      createSession: vi.fn(async () => ({ id: 101 })),
      updateSession: vi.fn(async () => undefined),
      appendEvent,
      mirrorTeam: vi.fn(async () => undefined),
    };

    await executeOwnWorkShiftAction(store, { tenantId: 7, userId: 42, teamId: 3, action: "start", now: new Date("2026-09-05T08:10:00.000Z") });

    expect(order).toEqual(["persisted", "published"]);
    expect(appendEvent).toHaveBeenCalledOnce();
    expect(anomalyMocks.publishWorkShiftOperationalEvent).toHaveBeenCalledOnce();
  });

  it("não publica evento operacional quando a persistência D-007A falha", async () => {
    const store: WorkShiftStore = {
      getOpenSession: vi.fn(async () => null),
      createSession: vi.fn(async () => ({ id: 101 })),
      updateSession: vi.fn(async () => undefined),
      appendEvent: vi.fn(async () => { throw new Error("persist failed"); }),
      mirrorTeam: vi.fn(async () => undefined),
    };

    await expect(executeOwnWorkShiftAction(store, { tenantId: 7, userId: 42, teamId: 3, action: "start" })).rejects.toThrow("persist failed");
    expect(anomalyMocks.publishWorkShiftOperationalEvent).not.toHaveBeenCalled();
  });
});
