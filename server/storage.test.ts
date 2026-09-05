import { afterEach, describe, expect, it, vi } from "vitest";
import { storageGetSignedUrl, storagePut } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("armazenamento gerenciado simulado", () => {
  it("obtém URL de upload, envia o arquivo e mantém a URL interna", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://storage.test/upload" }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await storagePut(
      "profile-photos/9/avatar.png",
      Buffer.from("imagem"),
      "image/png",
    );

    expect(result.url).toMatch(
      /^\/manus-storage\/profile-photos\/9\/avatar_[a-f0-9]{8}\.png$/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const presignRequest = fetchMock.mock.calls[0]?.[0] as URL;
    expect(presignRequest.pathname).toContain("/v1/storage/presign/put");
    expect(presignRequest.searchParams.get("path")).toBe(result.key);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://storage.test/upload");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/png" },
    });
  });

  it("obtém URL temporária para o proxy autorizado de download", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://storage.test/signed-object" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      storageGetSignedUrl("incident-evidence/1/foto.jpg"),
    ).resolves.toBe("https://storage.test/signed-object");

    const request = fetchMock.mock.calls[0]?.[0] as URL;
    expect(request.pathname).toContain("/v1/storage/presign/get");
    expect(request.searchParams.get("path")).toBe(
      "incident-evidence/1/foto.jpg",
    );
  });
});
