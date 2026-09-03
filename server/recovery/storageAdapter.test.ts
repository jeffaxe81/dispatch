import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgeRecoveryStorageAdapter } from "./storageAdapter";

describe("ForgeRecoveryStorageAdapter", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-storage-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function createAdapter(fetchImpl = vi.fn()) {
    return {
      adapter: new ForgeRecoveryStorageAdapter({
        apiUrl: "https://forge.example.test/api",
        apiKey: "recovery-api-key",
        targetPrefix: "recovery-drills/d005",
        fetchImpl: fetchImpl as typeof fetch,
      }),
      fetchImpl,
    };
  }

  it("streams a downloaded object from a presigned GET URL", async () => {
    const { adapter, fetchImpl } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "https://signed.test/source" }), {
            headers: { "Content-Type": "application/json" },
          })
        )
        .mockResolvedValueOnce(new Response("synthetic evidence"))
    );
    const destination = join(root, "evidence.jpg");

    await adapter.download("/incident-evidence/9/photo.jpg", destination);

    const presignRequest = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(presignRequest.pathname).toBe("/api/v1/storage/presign/get");
    expect(presignRequest.searchParams.get("path")).toBe(
      "incident-evidence/9/photo.jpg"
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer recovery-api-key" },
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://signed.test/source");
    expect(await readFile(destination, "utf8")).toBe("synthetic evidence");
  });

  it("allows a source-only adapter without a target prefix", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://signed.test/source" }), {
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response("source-only evidence"));
    const adapter = new ForgeRecoveryStorageAdapter({
      apiUrl: "https://forge.example.test/api",
      apiKey: "source-api-key",
      targetPrefix: "",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const destination = join(root, "source-only.jpg");

    await adapter.download("incident-evidence/9/photo.jpg", destination);

    expect(await readFile(destination, "utf8")).toBe("source-only evidence");
  });

  it("refuses uploads from a source-only adapter", async () => {
    const fetchImpl = vi.fn();
    const adapter = new ForgeRecoveryStorageAdapter({
      apiUrl: "https://forge.example.test/api",
      apiKey: "source-api-key",
      targetPrefix: "",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const fixture = join(root, "source-only-upload.jpg");
    await writeFile(fixture, "must not be uploaded");

    await expect(
      adapter.upload("incident-evidence/9/photo.jpg", fixture, "image/jpeg")
    ).rejects.toThrow("target prefix is required for recovery uploads");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uploads a source stream under the isolated recovery prefix", async () => {
    const { adapter, fetchImpl } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "https://signed.test/target" }), {
            headers: { "Content-Type": "application/json" },
          })
        )
        .mockResolvedValueOnce(new Response(null, { status: 201 }))
    );
    const fixture = join(root, "fixture.jpg");
    await writeFile(fixture, "synthetic upload");

    const restoredKey = await adapter.upload(
      "/incident-evidence/9/photo.jpg",
      fixture,
      "image/jpeg"
    );

    const presignRequest = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(restoredKey).toBe(
      "recovery-drills/d005/incident-evidence/9/photo.jpg"
    );
    expect(presignRequest.pathname).toBe("/api/v1/storage/presign/put");
    expect(presignRequest.searchParams.get("path")).toBe(restoredKey);
    const upload = fetchImpl.mock.calls[1]?.[1] as RequestInit;
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://signed.test/target");
    expect(upload).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(await new Response(upload.body).text()).toBe("synthetic upload");
  });

  it("uses a thirty-second abort signal for every storage request", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { adapter } = createAdapter(
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ url: "https://signed.test/source" }), {
            headers: { "Content-Type": "application/json" },
          })
        )
        .mockResolvedValueOnce(new Response("synthetic evidence"))
    );

    await adapter.download("evidence/a.jpg", join(root, "evidence.jpg"));

    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 30_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 30_000);
  });

  it("rejects traversal before sending a storage request", async () => {
    const { adapter, fetchImpl } = createAdapter();

    await expect(
      adapter.download("incident-evidence/../private.jpg", join(root, "x"))
    ).rejects.toThrow("storage key contains unsafe segments");
    await expect(
      adapter.upload(
        "evidence/%2e%2e/private.jpg",
        join(root, "x"),
        "image/jpeg"
      )
    ).rejects.toThrow("storage key contains unsafe segments");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not include signed URLs or response bodies in errors", async () => {
    const { adapter } = createAdapter(
      vi.fn().mockResolvedValue(
        new Response("token=secret", {
          status: 503,
          statusText: "https://signed.test/secret",
        })
      )
    );

    await expect(
      adapter.download("evidence/a.jpg", join(root, "evidence.jpg"))
    ).rejects.toThrow("storage request failed (503)");
    await expect(
      adapter.download("evidence/a.jpg", join(root, "evidence.jpg"))
    ).rejects.not.toThrow(/token=secret|https:\/\//);
  });
});
