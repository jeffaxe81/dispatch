import { createHash } from "node:crypto";
import { watch } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encryptBuffer } from "./crypto";
import {
  artifactPathForKey,
  readAndValidateManifest,
  readRecoveryVersionMetadata,
  writeEncryptedManifestAtomic,
} from "./manifest";
import type { RecoveryManifest } from "./types";

const key = Buffer.alloc(32, 0x37);

const baseManifest: RecoveryManifest = {
  formatVersion: 1,
  id: "run-d005-20260830",
  createdAt: "2026-08-30T08:00:00.000Z",
  appVersion: "1.15.4",
  schemaVersion: "0002_aromatic_warhawk:123456789abc",
  sourceClass: "synthetic",
  sourceLabel: "ensaio sintético D-005",
  status: "complete",
  tableCounts: { incidents: 2, incident_evidence: 1 },
  artifacts: [
    {
      kind: "database",
      relativePath: "artifacts/database.sql.enc",
      logicalKey: null,
      contentType: "application/sql",
      byteSize: 4096,
      plaintextSha256:
        "1111111111111111111111111111111111111111111111111111111111111111",
      encryptedSha256:
        "2222222222222222222222222222222222222222222222222222222222222222",
      references: [],
    },
    {
      kind: "object",
      relativePath:
        "artifacts/objects/84a6912bc9a2eec8af94def6cd98ae07ddb8dde2dcef3c2d4732c0bb23a56cd0.enc",
      logicalKey: "evidence/occurrence-42/photo.jpg",
      contentType: "image/jpeg",
      byteSize: 1024,
      plaintextSha256:
        "3333333333333333333333333333333333333333333333333333333333333333",
      encryptedSha256:
        "4444444444444444444444444444444444444444444444444444444444444444",
      references: [
        {
          table: "incident_evidence",
          rowId: 42,
          column: "storage_key",
          key: "evidence/occurrence-42/photo.jpg",
          contentType: "image/jpeg",
          expectedByteSize: 1024,
        },
      ],
    },
  ],
};

describe("recovery manifest", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-manifest-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeRawPackage(manifest: unknown): Promise<void> {
    const temporaryEncryptedPath = join(root, "raw-manifest.json.enc");
    const encrypted = await encryptBuffer(
      Buffer.from(JSON.stringify(manifest)),
      temporaryEncryptedPath,
      key
    );
    const encryptedManifestPath = `manifests/${encrypted.encryptedSha256}.enc`;
    await mkdir(join(root, "manifests"));
    await rename(temporaryEncryptedPath, join(root, encryptedManifestPath));
    await writeFile(
      join(root, "recovery-envelope.json"),
      JSON.stringify({
        formatVersion: 1,
        id: "run-d005-20260830",
        createdAt: "2026-08-30T08:00:00.000Z",
        status: "complete",
        encryptedManifestPath,
        encryptedManifestSha256: encrypted.encryptedSha256,
      })
    );
  }

  async function waitForOpenDescriptor(path: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      for (const descriptor of await readdir("/proc/self/fd")) {
        try {
          if ((await readlink(join("/proc/self/fd", descriptor))) === path) {
            return;
          }
        } catch {
          // The descriptor may close between readdir and readlink.
        }
      }
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    throw new Error("encrypted manifest descriptor was not observed");
  }

  it("maps an identifying logical key to a non-identifying artifact path", () => {
    expect(artifactPathForKey("evidence/occurrence-42/photo.jpg")).toBe(
      "artifacts/objects/84a6912bc9a2eec8af94def6cd98ae07ddb8dde2dcef3c2d4732c0bb23a56cd0.enc"
    );
  });

  it("publishes only a non-sensitive envelope and restores the encrypted manifest", async () => {
    await writeEncryptedManifestAtomic(root, baseManifest, key);

    const envelopeBytes = await readFile(join(root, "recovery-envelope.json"));
    const envelope = JSON.parse(envelopeBytes.toString("utf8"));
    const encryptedManifest = await readFile(
      join(root, envelope.encryptedManifestPath)
    );
    const actualEncryptedHash = createHash("sha256")
      .update(encryptedManifest)
      .digest("hex");

    expect(Object.keys(envelope).sort()).toEqual([
      "createdAt",
      "encryptedManifestPath",
      "encryptedManifestSha256",
      "formatVersion",
      "id",
      "status",
    ]);
    expect(envelope).toEqual({
      formatVersion: 1,
      id: "run-d005-20260830",
      createdAt: "2026-08-30T08:00:00.000Z",
      status: "complete",
      encryptedManifestPath: `manifests/${actualEncryptedHash}.enc`,
      encryptedManifestSha256: actualEncryptedHash,
    });
    expect(envelopeBytes.toString("utf8")).not.toContain(
      "ensaio sintético D-005"
    );
    expect(envelopeBytes.toString("utf8")).not.toContain(
      "evidence/occurrence-42/photo.jpg"
    );
    expect(encryptedManifest.toString("utf8")).not.toContain(
      "evidence/occurrence-42/photo.jpg"
    );
    await expect(readAndValidateManifest(root, key)).resolves.toEqual(
      baseManifest
    );
    await expect(stat(join(root, "manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(join(root, "recovery-envelope.json.partial"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not persist a plaintext manifest while publishing", async () => {
    const observedNames = new Set<string>();
    const watcher = watch(root, (_event, filename) => {
      if (filename) observedNames.add(filename);
    });

    try {
      await writeEncryptedManifestAtomic(root, baseManifest, key);
      await new Promise<void>(resolve => setImmediate(resolve));
    } finally {
      watcher.close();
    }

    expect(
      [...observedNames].filter(name =>
        /^\.manifest-.*\.json\.partial$/.test(name)
      )
    ).toEqual([]);
    for (const relativePath of await readdir(root, { recursive: true })) {
      const path = join(root, relativePath);
      if ((await stat(path)).isFile()) {
        expect((await readFile(path)).toString("utf8")).not.toContain(
          baseManifest.sourceLabel
        );
      }
    }
  });

  it("keeps the previous package valid when the next envelope publication fails", async () => {
    const previousManifest = {
      ...baseManifest,
      id: "run-d005-previous",
      sourceLabel: "pacote anterior válido",
    };
    const nextManifest = {
      ...baseManifest,
      id: "run-d005-next",
      sourceLabel: "pacote seguinte incompleto",
    };
    await writeEncryptedManifestAtomic(root, previousManifest, key);
    await writeFile(
      join(root, "recovery-envelope.json.partial"),
      "bloqueio sintético de publicação"
    );

    await expect(
      writeEncryptedManifestAtomic(root, nextManifest, key)
    ).rejects.toMatchObject({ code: "EEXIST" });
    await rm(join(root, "recovery-envelope.json.partial"));

    await expect(readAndValidateManifest(root, key)).resolves.toEqual(
      previousManifest
    );
  });

  it("publishes one complete package when concurrent writers race", async () => {
    const previousManifest = {
      ...baseManifest,
      id: "run-d005-previous",
      sourceLabel: "pacote anterior válido",
    };
    const firstConcurrentManifest = {
      ...baseManifest,
      id: "run-d005-concurrent-first",
      sourceLabel: "primeira publicação concorrente",
    };
    const secondConcurrentManifest = {
      ...baseManifest,
      id: "run-d005-concurrent-second",
      sourceLabel: "segunda publicação concorrente",
    };
    await writeEncryptedManifestAtomic(root, previousManifest, key);

    const results = await Promise.allSettled([
      writeEncryptedManifestAtomic(root, firstConcurrentManifest, key),
      writeEncryptedManifestAtomic(root, secondConcurrentManifest, key),
    ]);
    const successfulManifest = [
      firstConcurrentManifest,
      secondConcurrentManifest,
    ][results.findIndex(result => result.status === "fulfilled")];

    expect(
      results.filter(result => result.status === "fulfilled")
    ).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(
      1
    );
    await expect(readAndValidateManifest(root, key)).resolves.toEqual(
      successfulManifest
    );
  });

  it("rejects an envelope whose encrypted manifest hash does not match", async () => {
    await writeEncryptedManifestAtomic(root, baseManifest, key);
    const envelopePath = join(root, "recovery-envelope.json");
    const envelope = JSON.parse(await readFile(envelopePath, "utf8"));
    envelope.encryptedManifestSha256 =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await writeFile(envelopePath, JSON.stringify(envelope));

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "encrypted manifest hash mismatch"
    );
  });

  it("rejects an envelope larger than 16 KiB before parsing it", async () => {
    await writeEncryptedManifestAtomic(root, baseManifest, key);
    const envelopePath = join(root, "recovery-envelope.json");
    const envelope = await readFile(envelopePath, "utf8");
    await writeFile(envelopePath, `${envelope}${" ".repeat(16 * 1024)}`);

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "recovery envelope exceeds 16 KiB"
    );
  });

  it("rejects an oversized write without replacing the previous package", async () => {
    const previousManifest = {
      ...baseManifest,
      id: "run-d005-previous",
      sourceLabel: "pacote anterior válido",
    };
    await writeEncryptedManifestAtomic(root, previousManifest, key);
    const filesBefore = (await readdir(root, { recursive: true })).sort();
    const envelopeBefore = await readFile(join(root, "recovery-envelope.json"));
    const oversizedManifest = {
      ...baseManifest,
      id: "run-d005-oversized",
      sourceLabel: "x".repeat(64 * 1024 * 1024),
    };

    await expect(
      writeEncryptedManifestAtomic(root, oversizedManifest, key)
    ).rejects.toThrow("recovery manifest exceeds 64 MiB");

    expect(await readFile(join(root, "recovery-envelope.json"))).toEqual(
      envelopeBefore
    );
    expect((await readdir(root, { recursive: true })).sort()).toEqual(
      filesBefore
    );
    await expect(readAndValidateManifest(root, key)).resolves.toEqual(
      previousManifest
    );
  }, 30_000);

  it("checks the oversized manifest limit before contending with a package lock", async () => {
    const previousManifest = {
      ...baseManifest,
      id: "run-d005-previous",
      sourceLabel: "pacote anterior válido",
    };
    await writeEncryptedManifestAtomic(root, previousManifest, key);
    const lockPath = join(root, "recovery-envelope.json.lock");
    const lockContents = "writer concorrente ativo";
    await writeFile(lockPath, lockContents);
    const filesBefore = (await readdir(root, { recursive: true })).sort();
    const envelopeBefore = await readFile(join(root, "recovery-envelope.json"));
    const oversizedManifest = {
      ...baseManifest,
      id: "run-d005-oversized",
      sourceLabel: "x".repeat(64 * 1024 * 1024),
    };

    await expect(
      writeEncryptedManifestAtomic(root, oversizedManifest, key)
    ).rejects.toThrow("recovery manifest exceeds 64 MiB");

    expect(await readFile(lockPath, "utf8")).toBe(lockContents);
    expect(await readFile(join(root, "recovery-envelope.json"))).toEqual(
      envelopeBefore
    );
    expect((await readdir(root, { recursive: true })).sort()).toEqual(
      filesBefore
    );
    await expect(readAndValidateManifest(root, key)).resolves.toEqual(
      previousManifest
    );
  }, 30_000);

  it("rejects a decrypted manifest larger than 64 MiB without publishing plaintext", async () => {
    const oversizedManifest = {
      ...baseManifest,
      sourceLabel: "x".repeat(64 * 1024 * 1024),
    };
    await writeRawPackage(oversizedManifest);

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "decrypted artifact exceeds maximum plaintext size"
    );
    expect(
      (await readdir(root)).filter(name =>
        /^\.manifest-.*\.decrypted(?:\.partial)?$/.test(name)
      )
    ).toEqual([]);
  }, 30_000);

  it("keeps validating the opened inode when the encrypted manifest path is replaced", async () => {
    const replacementRoot = join(root, "replacement-package");
    await mkdir(replacementRoot);
    const largeLabelByteSize = 24 * 1024 * 1024;
    const originalManifest = {
      ...baseManifest,
      sourceLabel: `A${"a".repeat(largeLabelByteSize - 1)}`,
    };
    const replacementManifest = {
      ...baseManifest,
      sourceLabel: `B${"b".repeat(largeLabelByteSize - 1)}`,
    };
    await writeEncryptedManifestAtomic(root, originalManifest, key);
    await writeEncryptedManifestAtomic(
      replacementRoot,
      replacementManifest,
      key
    );
    const originalEnvelope = JSON.parse(
      await readFile(join(root, "recovery-envelope.json"), "utf8")
    );
    const replacementEnvelope = JSON.parse(
      await readFile(join(replacementRoot, "recovery-envelope.json"), "utf8")
    );
    const encryptedManifestPath = join(
      root,
      originalEnvelope.encryptedManifestPath
    );
    const replacementPath = join(root, "replacement-manifest.enc");
    await copyFile(
      join(replacementRoot, replacementEnvelope.encryptedManifestPath),
      replacementPath
    );

    const validation = readAndValidateManifest(root, key);
    await waitForOpenDescriptor(encryptedManifestPath);
    await rename(encryptedManifestPath, `${encryptedManifestPath}.original`);
    await rename(replacementPath, encryptedManifestPath);
    const validatedManifest = await validation;

    expect(validatedManifest.sourceLabel.charAt(0)).toBe("A");
    expect(Buffer.byteLength(validatedManifest.sourceLabel)).toBe(
      largeLabelByteSize
    );
  });

  it("rejects unknown top-level manifest keys", async () => {
    await writeRawPackage({ ...baseManifest, credential: "must-not-exist" });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow();
  });

  it.each([
    "/var/backups/database.sql.enc",
    "artifacts/../manifest.json.enc",
    "C:\\backups\\database.sql.enc",
  ])("rejects the unsafe artifact path %s", async relativePath => {
    await writeRawPackage({
      ...baseManifest,
      artifacts: [{ ...baseManifest.artifacts[0], relativePath }],
    });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "artifact path must be relative and traversal-free"
    );
  });

  it("rejects duplicate logical object keys", async () => {
    const objectArtifact = baseManifest.artifacts[1];
    await writeRawPackage({
      ...baseManifest,
      artifacts: [objectArtifact, { ...objectArtifact }],
    });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "duplicate artifact logical key"
    );
  });

  it("rejects duplicate artifact paths", async () => {
    const databaseArtifact = baseManifest.artifacts[0];
    await writeRawPackage({
      ...baseManifest,
      artifacts: [databaseArtifact, { ...databaseArtifact }],
    });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "duplicate artifact relative path"
    );
  });

  it("rejects non-hex artifact hashes", async () => {
    await writeRawPackage({
      ...baseManifest,
      artifacts: [
        {
          ...baseManifest.artifacts[0],
          plaintextSha256: `${"a".repeat(63)}g`,
        },
      ],
    });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow();
  });

  it("rejects an incomplete manifest during restore", async () => {
    await writeRawPackage({ ...baseManifest, status: "invalid" });

    await expect(readAndValidateManifest(root, key)).rejects.toThrow(
      "manifest status must be complete"
    );
  });

  it("derives literal application and schema versions from project metadata", async () => {
    const projectRoot = join(root, "project");
    await mkdir(join(projectRoot, "drizzle", "meta"), { recursive: true });
    await writeFile(
      join(projectRoot, "package.json"),
      '{"name":"fixture","version":"9.8.7"}\n'
    );
    await writeFile(
      join(projectRoot, "drizzle", "meta", "_journal.json"),
      '{"entries":[{"tag":"0001_first"},{"tag":"0002_last"}]}\n'
    );

    await expect(readRecoveryVersionMetadata(projectRoot)).resolves.toEqual({
      appVersion: "9.8.7",
      schemaVersion: "0002_last:d752e3530696",
    });
  });
});
