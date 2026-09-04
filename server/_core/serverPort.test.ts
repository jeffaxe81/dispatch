import { describe, expect, it, vi } from "vitest";
import {
  findAvailablePort,
  parseServerPort,
  selectServerPort,
} from "./serverPort";

describe("configuração da porta do servidor", () => {
  it.each([
    { input: undefined, expected: 3000 },
    { input: "8080", expected: 8080 },
    { input: " 4000 ", expected: 4000 },
  ])("converte $input para $expected", ({ input, expected }) => {
    expect(parseServerPort(input)).toBe(expected);
  });

  it.each(["", "0", "-1", "65536", "3.5", "3000abc"])(
    "rejeita PORT inválida: %j",
    input => {
      expect(() => parseServerPort(input)).toThrow("PORT");
    },
  );

  it("mantém a porta configurada em produção sem procurar alternativa", async () => {
    const isAvailable = vi.fn().mockResolvedValue(false);

    await expect(
      selectServerPort({
        configuredPort: 3000,
        isProduction: true,
        isAvailable,
      }),
    ).resolves.toBe(3000);
    expect(isAvailable).not.toHaveBeenCalled();
  });

  it("procura a próxima porta disponível somente fora de produção", async () => {
    const isAvailable = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      selectServerPort({
        configuredPort: 3000,
        isProduction: false,
        isAvailable,
      }),
    ).resolves.toBe(3001);
    expect(isAvailable).toHaveBeenNthCalledWith(1, 3000);
    expect(isAvailable).toHaveBeenNthCalledWith(2, 3001);
  });

  it("interrompe após vinte portas indisponíveis", async () => {
    const isAvailable = vi.fn().mockResolvedValue(false);

    await expect(findAvailablePort(3000, isAvailable)).rejects.toThrow(
      "No available port",
    );
    expect(isAvailable).toHaveBeenCalledTimes(20);
    expect(isAvailable).toHaveBeenLastCalledWith(3019);
  });
});
