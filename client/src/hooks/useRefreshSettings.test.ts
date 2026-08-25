import { describe, expect, it } from "vitest";
import { didRefreshFail, executeRefresh } from "@/components/RefreshControls";
import { formatRefreshInterval, refreshOptions, resolveRefreshInterval } from "./useRefreshSettings";

describe("configuração de atualização", () => {
  it("expõe os intervalos operacionais permitidos e o modo manual", () => {
    expect(refreshOptions.map(option => option.value)).toEqual([5_000, 10_000, 30_000, 60_000, 0]);
  });

  it("apresenta o modo manual quando o intervalo está desativado", () => {
    expect(formatRefreshInterval(0)).toBe("Manual");
    expect(resolveRefreshInterval(0)).toBe(0);
    expect(resolveRefreshInterval(30_000)).toBe(30_000);
    expect(resolveRefreshInterval(12_345)).toBe(10_000);
  });

  it("formata os intervalos automáticos para exibição ao operador", () => {
    expect(formatRefreshInterval(5_000)).toBe("5 s");
    expect(formatRefreshInterval(30_000)).toBe("30 s");
    expect(formatRefreshInterval(60_000)).toBe("1 min");
  });

  it("identifica resultados de consulta com falha para informar indisponibilidade ao operador", () => {
    expect(didRefreshFail({ error: new Error("network") })).toBe(true);
    expect(didRefreshFail([{ data: { ok: true } }, { error: new Error("network") }])).toBe(true);
    expect(didRefreshFail({ data: { ok: true } })).toBe(false);
  });

  it("aciona a consulta manual e informa sucesso ou indisponibilidade", async () => {
    let calls = 0;
    await expect(executeRefresh(async () => {
      calls += 1;
      return { data: { refreshed: true } };
    })).resolves.toEqual({ succeeded: true });
    expect(calls).toBe(1);
    await expect(executeRefresh(async () => {
      throw new Error("network unavailable");
    })).resolves.toEqual({ succeeded: false });
  });
});
