import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLogs, userProfiles, users } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ storagePut: vi.fn() }));

vi.mock("./storage", async importOriginal => ({
  ...(await importOriginal<typeof import("./storage")>()),
  storagePut: mocks.storagePut,
}));

import { decodeProfilePhotoBase64, setDbForTesting, uploadUserProfilePhoto } from "./db";

function validPngBase64() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
}

function createProfilePhotoHarness() {
  const updates: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === users ? [{ id: 7 }] : [] }) }) }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === userProfiles) return { onDuplicateKeyUpdate: async ({ set }: { set: Record<string, unknown> }) => { updates.push({ ...values, ...set }); } };
        if (table === auditLogs) { audits.push(values); return Promise.resolve(); }
        throw new Error("Tabela inesperada no teste de foto de perfil.");
      },
    }),
  };
  return { db: { transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) }, updates, audits };
}

let originalNodeEnv: string | undefined;

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  mocks.storagePut.mockResolvedValue({ key: "profile-photos/7/novo-perfil.png", url: "/manus-storage/profile-photos/7/novo-perfil.png" });
});
afterEach(() => {
  setDbForTesting(null);
  process.env.NODE_ENV = originalNodeEnv;
  vi.clearAllMocks();
});

describe("foto de perfil", () => {
  it("aceita somente imagens declaradas e com assinatura compatível", () => {
    expect(decodeProfilePhotoBase64({ contentType: "image/png", dataBase64: validPngBase64() })).toMatchObject({ extension: "png" });
    expect(() => decodeProfilePhotoBase64({ contentType: "application/pdf", dataBase64: validPngBase64() })).toThrow("JPEG, PNG ou WEBP");
    expect(() => decodeProfilePhotoBase64({ contentType: "image/jpeg", dataBase64: validPngBase64() })).toThrow("não corresponde ao tipo declarado");
  });

  it("armazena a referência, sem bytes no banco, e registra a alteração em auditoria", async () => {
    const harness = createProfilePhotoHarness();
    setDbForTesting(harness.db as never);

    const result = await uploadUserProfilePhoto({ userId: 7, actorUserId: 2, fileName: "foto perfil.png", contentType: "image/png", dataBase64: validPngBase64() });

    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^profile-photos\/7\//), expect.any(Buffer), "image/png");
    expect(result).toMatchObject({ contentType: "image/png", byteSize: 8, url: "/manus-storage/profile-photos/7/novo-perfil.png" });
    expect(harness.updates[0]).toMatchObject({ userId: 7, avatarStorageKey: "profile-photos/7/novo-perfil.png", avatarContentType: "image/png" });
    expect(harness.audits[0]).toMatchObject({ resourceType: "user", resourceId: 7, action: "profile_photo_updated", actorUserId: 2, afterData: expect.objectContaining({ hasProfilePhoto: true, byteSize: 8, storagePersisted: true }) });
  });
});
