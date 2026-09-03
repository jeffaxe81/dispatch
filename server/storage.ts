// Storage helpers for evidence and profile-photo objects.
//
// Two backends are supported:
// - S3-compatible (self-hosted/containerized deployments): used whenever
//   STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY
//   are configured. Works with AWS S3 or any compatible service (e.g. MinIO)
//   via STORAGE_S3_ENDPOINT / STORAGE_S3_FORCE_PATH_STYLE.
// - Forge (Manus-managed storage): the historical default, kept for
//   deployments running on the Manus platform.
// Downloads always go through the authorized /manus-storage/* proxy
// registered by server/_core/storageProxy.ts.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function getS3Config() {
  const bucket = ENV.storageS3Bucket;
  const accessKeyId = ENV.storageS3AccessKeyId;
  const secretAccessKey = ENV.storageS3SecretAccessKey;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, accessKeyId, secretAccessKey };
}

let cachedS3Client: S3Client | null = null;

function getS3Client(accessKeyId: string, secretAccessKey: string): S3Client {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: ENV.storageS3Region || "us-east-1",
      endpoint: ENV.storageS3Endpoint || undefined,
      forcePathStyle: ENV.storageS3ForcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return cachedS3Client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const s3Config = getS3Config();

  if (s3Config) {
    const client = getS3Client(s3Config.accessKeyId, s3Config.secretAccessKey);
    const body = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, url: `/manus-storage/${key}` };
  }

  const { forgeUrl, forgeKey } = getForgeConfig();

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!presignResp.ok) {
    const message = await presignResp
      .text()
      .catch(() => presignResp.statusText);
    throw new Error(
      `Storage presign failed (${presignResp.status}): ${message}`,
    );
  }

  const { url: uploadUrl } = (await presignResp.json()) as { url: string };
  if (!uploadUrl) throw new Error("Forge returned empty presign URL");

  const body =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as BlobPart], { type: contentType });
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const s3Config = getS3Config();

  if (s3Config) {
    const client = getS3Client(s3Config.accessKeyId, s3Config.secretAccessKey);
    return getS3SignedUrl(
      client,
      new GetObjectCommand({ Bucket: s3Config.bucket, Key: key }),
      { expiresIn: 300 },
    );
  }

  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const response = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage signed URL failed (${response.status}): ${message}`,
    );
  }
  const { url } = (await response.json()) as { url: string };
  if (!url) throw new Error("Forge returned empty signed URL");
  return url;
}
