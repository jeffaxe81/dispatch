import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { StorageRecoveryAdapter } from "./types";

const STORAGE_TIMEOUT_MS = 30_000;

export interface ForgeRecoveryStorageAdapterOptions {
  apiUrl: string;
  apiKey: string;
  targetPrefix: string;
  fetchImpl?: typeof fetch;
}

type PresignOperation = "get" | "put";

export class ForgeRecoveryStorageAdapter implements StorageRecoveryAdapter {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly targetPrefix: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ForgeRecoveryStorageAdapterOptions) {
    let apiUrl: URL;
    try {
      apiUrl = new URL(options.apiUrl);
    } catch {
      throw new Error("storage apiUrl must be a valid URL");
    }
    if (
      (apiUrl.protocol !== "https:" && apiUrl.protocol !== "http:") ||
      apiUrl.username ||
      apiUrl.password
    ) {
      throw new Error("storage apiUrl must be a safe HTTP URL");
    }
    if (!options.apiKey) {
      throw new Error("storage apiKey is required");
    }

    this.apiUrl = apiUrl.toString();
    this.apiKey = options.apiKey;
    this.targetPrefix = options.targetPrefix
      ? normalizeKey(options.targetPrefix, "target prefix")
      : "";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async download(key: string, destination: string): Promise<void> {
    const objectKey = normalizeKey(key, "storage key");
    const downloadUrl = await this.presign("get", objectKey);
    const response = await this.request(downloadUrl);
    if (!response.ok) throw storageRequestFailed(response.status);
    if (!response.body)
      throw new Error("storage response did not include a body");

    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(destination)
    );
  }

  async upload(
    originalKey: string,
    source: string,
    contentType: string
  ): Promise<string> {
    if (!this.targetPrefix) {
      throw new Error("target prefix is required for recovery uploads");
    }
    const objectKey = normalizeKey(originalKey, "storage key");
    const restoredKey = `${this.targetPrefix}/${objectKey}`;
    const uploadUrl = await this.presign("put", restoredKey);
    const response = await this.request(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: Readable.toWeb(createReadStream(source)),
      duplex: "half",
    } as RequestInit);
    if (!response.ok) throw storageRequestFailed(response.status);

    return restoredKey;
  }

  private async presign(
    operation: PresignOperation,
    path: string
  ): Promise<string> {
    const requestUrl = new URL(
      `v1/storage/presign/${operation}`,
      `${this.apiUrl}/`
    );
    requestUrl.searchParams.set("path", path);
    const response = await this.request(requestUrl, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw storageRequestFailed(response.status);

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error("storage presign response was invalid");
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("url" in value) ||
      typeof value.url !== "string"
    ) {
      throw new Error("storage presign response was invalid");
    }
    try {
      const url = new URL(value.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error();
      }
      return value.url;
    } catch {
      throw new Error("storage presign response was invalid");
    }
  }

  private async request(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    try {
      return await this.fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
    } catch {
      throw new Error("storage request failed");
    }
  }
}

function normalizeKey(
  value: string,
  name: "storage key" | "target prefix"
): string {
  const normalized = value.replace(/^\/+/, "");
  if (!normalized) throw new Error(`${name} must not be empty`);

  for (const segment of normalized.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(`${name} contains unsafe segments`);
    }
    if (
      !segment ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\u0000")
    ) {
      throw new Error(`${name} contains unsafe segments`);
    }
  }
  return normalized;
}

function storageRequestFailed(status: number): Error {
  return new Error(`storage request failed (${status})`);
}
