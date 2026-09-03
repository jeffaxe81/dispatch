import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation(input => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation(input => ({ input })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

describe("armazenamento S3 compatível", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    process.env.STORAGE_S3_BUCKET = "axe-dispatch-evidencias";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "chave-teste";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "segredo-teste";
    process.env.STORAGE_S3_ENDPOINT = "http://minio:9000";
    process.env.STORAGE_S3_FORCE_PATH_STYLE = "true";
  });

  afterEach(() => {
    delete process.env.STORAGE_S3_BUCKET;
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    delete process.env.STORAGE_S3_ENDPOINT;
    delete process.env.STORAGE_S3_FORCE_PATH_STYLE;
  });

  it("envia o objeto diretamente para o bucket configurado e mantém a URL interna", async () => {
    sendMock.mockResolvedValueOnce({});
    const { storagePut } = await import("./storage");

    const result = await storagePut(
      "profile-photos/9/avatar.png",
      Buffer.from("imagem"),
      "image/png",
    );

    expect(result.url).toMatch(
      /^\/manus-storage\/profile-photos\/9\/avatar_[a-f0-9]{8}\.png$/,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: "axe-dispatch-evidencias",
      Key: result.key,
      ContentType: "image/png",
    });
  });

  it("gera uma URL assinada para o proxy autorizado de download", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://minio.local/signed-object");
    const { storageGetSignedUrl } = await import("./storage");

    await expect(
      storageGetSignedUrl("incident-evidence/1/foto.jpg"),
    ).resolves.toBe("https://minio.local/signed-object");

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const command = getSignedUrlMock.mock.calls[0]?.[1] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: "axe-dispatch-evidencias",
      Key: "incident-evidence/1/foto.jpg",
    });
  });
});
