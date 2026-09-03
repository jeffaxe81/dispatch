import { createHash } from "node:crypto";
import {
  appendFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptFile, encryptFile, sha256File } from "./crypto";

describe("recovery artifact encryption", () => {
  let root: string;
  let source: string;
  let cipher: string;
  let restored: string;
  const key = Buffer.alloc(32, 0x2a);

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dispatch-recovery-crypto-"));
    source = join(root, "database.sql");
    cipher = join(root, "database.sql.enc");
    restored = join(root, "database-restored.sql");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("encrypts, authenticates and restores the exact bytes", async () => {
    const plaintext = Buffer.from("evidência sintética");
    await writeFile(source, plaintext);

    const encrypted = await encryptFile(source, cipher, key);
    const decrypted = await decryptFile(cipher, restored, key);
    const encryptedBytes = await readFile(cipher);

    expect(await readFile(restored)).toEqual(plaintext);
    expect(encrypted.plaintextSha256).toBe(
      "440af4806df220b64cb6e7f6145b8f15f5b26856bd91813240d48ca523083c2c"
    );
    expect(encrypted.encryptedSha256).toBe(
      createHash("sha256").update(encryptedBytes).digest("hex")
    );
    expect(encrypted.byteSize).toBe(21);
    expect(decrypted).toEqual({
      plaintextSha256:
        "440af4806df220b64cb6e7f6145b8f15f5b26856bd91813240d48ca523083c2c",
      byteSize: 21,
    });
    expect(encryptedBytes.subarray(0, 8).toString("ascii")).toBe("AXED0051");
    expect(encryptedBytes.byteLength).toBe(57);
    await expect(stat(`${cipher}.partial`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(`${restored}.partial`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a modified encrypted artifact without publishing plaintext", async () => {
    await writeFile(source, Buffer.from("conteúdo protegido"));
    await writeFile(restored, Buffer.from("restauração anterior"));
    await encryptFile(source, cipher, key);
    await appendFile(cipher, Buffer.from([0xff]));

    await expect(decryptFile(cipher, restored, key)).rejects.toThrow(
      "artifact authentication failed"
    );

    expect(await readFile(restored, "utf8")).toBe("restauração anterior");
    await expect(stat(`${restored}.partial`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("hashes a file from its actual bytes", async () => {
    await writeFile(source, Buffer.from("abc"));

    await expect(sha256File(source)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("rejects keys that are not exactly 32 bytes", async () => {
    await writeFile(source, Buffer.from("segredo"));

    await expect(encryptFile(source, cipher, Buffer.alloc(31))).rejects.toThrow(
      "encryption key must be exactly 32 bytes"
    );
    await expect(stat(cipher)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(`${cipher}.partial`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
