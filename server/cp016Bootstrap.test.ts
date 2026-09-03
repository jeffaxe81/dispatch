import { describe, expect, it, vi } from "vitest";
import { ensureDefaultNeoIntegration, NEO_DEFAULT_INTEGRATION } from "./cp016Bootstrap";

describe("CP-016 NEO bootstrap", () => {
  it("cria a configuração NEO padrão quando ainda não existe", async () => {
    const save = vi.fn().mockResolvedValue({ id: 1 });

    await ensureDefaultNeoIntegration({
      findExisting: vi.fn().mockResolvedValue(null),
      findAdministratorId: vi.fn().mockResolvedValue(42),
      save,
    });

    expect(save).toHaveBeenCalledWith({
      ...NEO_DEFAULT_INTEGRATION,
      actorUserId: 42,
    });
    expect(NEO_DEFAULT_INTEGRATION.url).toBe("https://gscprj.saas.digitro.cloud/neo/");
    expect(NEO_DEFAULT_INTEGRATION.enabled).toBe(true);
  });

  it("não sobrescreve uma configuração já existente", async () => {
    const save = vi.fn();
    const existing = { id: 7, code: "neo-interact", url: "https://custom.example/neo/" };

    const result = await ensureDefaultNeoIntegration({
      findExisting: vi.fn().mockResolvedValue(existing),
      findAdministratorId: vi.fn(),
      save,
    });

    expect(result).toBe(existing);
    expect(save).not.toHaveBeenCalled();
  });

  it("não cria registro sem administrador responsável pela trilha de auditoria", async () => {
    const save = vi.fn();

    const result = await ensureDefaultNeoIntegration({
      findExisting: vi.fn().mockResolvedValue(null),
      findAdministratorId: vi.fn().mockResolvedValue(null),
      save,
    });

    expect(result).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
