import express from "express";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), resolve: vi.fn(), sign: vi.fn(), assertPermission: vi.fn(), assertTeamScope: vi.fn(), assertCanRead: vi.fn() }));
vi.mock("./localAuth", () => ({ authenticateLocalRequest: mocks.authenticate }));
vi.mock("./db", () => ({ getStoredObjectAuthorization: mocks.resolve }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.sign }));
vi.mock("./accessControl", () => ({ assertPermission: mocks.assertPermission, assertTeamScope: mocks.assertTeamScope }));
vi.mock("./authorization", () => ({ assertCanReadIncident: mocks.assertCanRead }));

import { registerStorageProxy } from "./_core/storageProxy";

async function withServer(run: (origin: string) => Promise<void>) {
  const app = express();
  registerStorageProxy(app);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const listening = app.listen(0, () => resolve(listening)); });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor indisponível");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("proxy de armazenamento privado", () => {
  it("nega evidência a uma requisição anônima", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error("sem sessão"));
    await withServer(async origin => {
      const response = await fetch(`${origin}/manus-storage/incident-evidence/1/arquivo.pdf`, { redirect: "manual" });
      expect(response.status).toBe(401);
      expect(mocks.sign).not.toHaveBeenCalled();
    });
  });

  it("assina somente a foto pertencente ao usuário autenticado", async () => {
    mocks.authenticate.mockResolvedValueOnce({ id: 7 });
    mocks.resolve.mockResolvedValueOnce({ kind: "profile_photo", ownerUserId: 7 });
    mocks.sign.mockResolvedValueOnce("https://storage.example/signed");
    await withServer(async origin => {
      const response = await fetch(`${origin}/manus-storage/profile-photos/7/avatar.png`, { redirect: "manual" });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://storage.example/signed");
    });
  });
});
