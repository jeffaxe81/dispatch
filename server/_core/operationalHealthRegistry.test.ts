import { describe, expect, it, vi } from "vitest";
import { createOperationalHealthRegistry } from "./operationalHealth";

describe("D-011A operational health registry adapter", () => {
  it("registra banco e storage como componentes bloqueantes reutilizando os checks existentes", async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const checkStorage = vi.fn().mockResolvedValue(undefined);
    const registry = createOperationalHealthRegistry({ checkDatabase, checkStorage, timeoutMs: 50 });

    expect(registry.definitions.map(definition => definition.id)).toEqual(["database", "storage"]);
    expect(registry.definitions.every(definition => definition.blocksReadiness)).toBe(true);

    const snapshot = await registry.probeAll(new Date("2026-09-07T17:00:00.000Z"));
    expect(snapshot.status).toBe("ready");
    expect(snapshot.components.map(component => component.state)).toEqual(["healthy", "healthy"]);
    expect(checkDatabase).toHaveBeenCalledTimes(1);
    expect(checkStorage).toHaveBeenCalledTimes(1);
  });

  it("converte falha de um check legado em unhealthy sem propagar detalhes", async () => {
    const registry = createOperationalHealthRegistry({
      checkDatabase: vi.fn().mockRejectedValue(new Error("mysql://usuario:senha@host/app")),
      checkStorage: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 50,
    });

    const snapshot = await registry.probeAll();
    expect(snapshot.status).toBe("not_ready");
    expect(snapshot.components.find(component => component.id === "database")?.state).toBe("unhealthy");
    expect(JSON.stringify(snapshot)).not.toContain("mysql://");
  });
});
