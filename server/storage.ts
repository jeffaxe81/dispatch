// Preconfigured storage helpers for Manus WebDev templates.
// Uploads use presigned URLs, while downloads remain behind the authorized
// /manus-storage/* proxy registered by server/_core/storageProxy.ts.
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
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

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
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
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
