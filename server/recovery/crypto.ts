import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { constants, createReadStream, type WriteStream } from "node:fs";
import { open, rename, unlink, type FileHandle } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("AXED0051", "ascii");
const IV_BYTE_SIZE = 12;
const AUTH_TAG_BYTE_SIZE = 16;
const HEADER_BYTE_SIZE = MAGIC.byteLength + IV_BYTE_SIZE;
const MINIMUM_ENCRYPTED_BYTE_SIZE = HEADER_BYTE_SIZE + AUTH_TAG_BYTE_SIZE;

export interface EncryptedFileResult {
  plaintextSha256: string;
  encryptedSha256: string;
  byteSize: number;
}

function validateKey(key: Buffer): void {
  if (key.byteLength !== 32) {
    throw new Error("encryption key must be exactly 32 bytes");
  }
}

function hashingTransform(
  hash: ReturnType<typeof createHash>,
  size: {
    value: number;
  }
): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      size.value += chunk.byteLength;
      callback(null, chunk);
    },
  });
}

async function removeOwnedPartial(path: string, owned: boolean): Promise<void> {
  if (!owned) return;
  try {
    await unlink(path);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
  }
}

export async function sha256File(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await sha256FileHandle(handle);
  } finally {
    await handle.close();
  }
}

async function sha256FileHandle(handle: FileHandle): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  while (true) {
    const { bytesRead } = await handle.read(
      buffer,
      0,
      buffer.byteLength,
      position
    );
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

async function encryptReadable(
  source: Readable,
  destination: string,
  key: Buffer
): Promise<EncryptedFileResult> {
  validateKey(key);
  const partialPath = `${destination}.partial`;
  const iv = randomBytes(IV_BYTE_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintextHash = createHash("sha256");
  const plaintextSize = { value: 0 };
  let partialOwned = false;
  let partialHandle: Awaited<ReturnType<typeof open>> | undefined;
  let output: WriteStream | undefined;

  try {
    partialHandle = await open(partialPath, "wx", 0o600);
    partialOwned = true;
    await partialHandle.write(
      Buffer.concat([MAGIC, iv]),
      0,
      HEADER_BYTE_SIZE,
      0
    );

    output = partialHandle.createWriteStream({
      autoClose: false,
      start: HEADER_BYTE_SIZE,
    });
    await pipeline(
      source,
      hashingTransform(plaintextHash, plaintextSize),
      cipher,
      output
    );

    const authTag = cipher.getAuthTag();
    await partialHandle.write(
      authTag,
      0,
      AUTH_TAG_BYTE_SIZE,
      HEADER_BYTE_SIZE + plaintextSize.value
    );
    await partialHandle.sync();
    output.destroy();
    output = undefined;
    await partialHandle.close();
    partialHandle = undefined;

    const encryptedSha256 = await sha256File(partialPath);
    await rename(partialPath, destination);
    partialOwned = false;

    return {
      plaintextSha256: plaintextHash.digest("hex"),
      encryptedSha256,
      byteSize: plaintextSize.value,
    };
  } catch (error) {
    output?.destroy();
    await partialHandle?.close().catch(() => undefined);
    await removeOwnedPartial(partialPath, partialOwned);
    throw error;
  }
}

export async function encryptFile(
  source: string,
  destination: string,
  key: Buffer
): Promise<EncryptedFileResult> {
  return encryptReadable(createReadStream(source), destination, key);
}

export async function encryptBuffer(
  source: Buffer,
  destination: string,
  key: Buffer
): Promise<EncryptedFileResult> {
  return encryptReadable(Readable.from([source]), destination, key);
}

function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /authenticate|authentication|bad decrypt/i.test(error.message)
  );
}

export async function decryptFile(
  source: string,
  destination: string,
  key: Buffer,
  expectedEncryptedSha256?: string,
  maximumPlaintextByteSize?: number
): Promise<{ plaintextSha256: string; byteSize: number }> {
  validateKey(key);
  const sourceHandle = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const sourceStat = await sourceHandle.stat();
    if (!sourceStat.isFile()) {
      throw new Error("invalid encrypted artifact");
    }
    if (
      sourceStat.size >= MINIMUM_ENCRYPTED_BYTE_SIZE &&
      maximumPlaintextByteSize !== undefined &&
      sourceStat.size - MINIMUM_ENCRYPTED_BYTE_SIZE > maximumPlaintextByteSize
    ) {
      throw new Error("decrypted artifact exceeds maximum plaintext size");
    }
    if (expectedEncryptedSha256) {
      const actualEncryptedSha256 = await sha256FileHandle(sourceHandle);
      if (actualEncryptedSha256 !== expectedEncryptedSha256) {
        throw new Error("encrypted manifest hash mismatch");
      }
    }
    return await decryptFileHandle(
      sourceHandle,
      sourceStat.size,
      destination,
      key
    );
  } finally {
    await sourceHandle.close();
  }
}

async function readExactly(
  handle: FileHandle,
  buffer: Buffer,
  position: number
): Promise<void> {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      position + offset
    );
    if (bytesRead === 0) throw new Error("invalid encrypted artifact");
    offset += bytesRead;
  }
}

async function* readRange(
  handle: FileHandle,
  start: number,
  byteSize: number
): AsyncGenerator<Buffer> {
  let offset = 0;
  while (offset < byteSize) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, byteSize - offset));
    const { bytesRead } = await handle.read(
      buffer,
      0,
      buffer.byteLength,
      start + offset
    );
    if (bytesRead === 0) throw new Error("invalid encrypted artifact");
    offset += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}

async function decryptFileHandle(
  sourceHandle: FileHandle,
  sourceSize: number,
  destination: string,
  key: Buffer
): Promise<{ plaintextSha256: string; byteSize: number }> {
  if (sourceSize < MINIMUM_ENCRYPTED_BYTE_SIZE) {
    throw new Error("invalid encrypted artifact");
  }

  const header = Buffer.alloc(HEADER_BYTE_SIZE);
  const authTag = Buffer.alloc(AUTH_TAG_BYTE_SIZE);
  await readExactly(sourceHandle, header, 0);
  await readExactly(sourceHandle, authTag, sourceSize - AUTH_TAG_BYTE_SIZE);

  if (!header.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
    throw new Error("invalid encrypted artifact");
  }

  const iv = header.subarray(MAGIC.byteLength);
  const ciphertextByteSize = sourceSize - MINIMUM_ENCRYPTED_BYTE_SIZE;
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintextHash = createHash("sha256");
  const plaintextSize = { value: 0 };
  const partialPath = `${destination}.partial`;
  let partialOwned = false;
  let partialHandle: Awaited<ReturnType<typeof open>> | undefined;
  let output: WriteStream | undefined;

  try {
    partialHandle = await open(partialPath, "wx", 0o600);
    partialOwned = true;
    const ciphertext =
      ciphertextByteSize === 0
        ? Readable.from([])
        : readRange(sourceHandle, HEADER_BYTE_SIZE, ciphertextByteSize);

    output = partialHandle.createWriteStream({
      autoClose: false,
      start: 0,
    });
    await pipeline(
      ciphertext,
      decipher,
      hashingTransform(plaintextHash, plaintextSize),
      output
    );

    await partialHandle.sync();
    output.destroy();
    output = undefined;
    await partialHandle.close();
    partialHandle = undefined;
    await rename(partialPath, destination);
    partialOwned = false;

    return {
      plaintextSha256: plaintextHash.digest("hex"),
      byteSize: plaintextSize.value,
    };
  } catch (error) {
    output?.destroy();
    await partialHandle?.close().catch(() => undefined);
    await removeOwnedPartial(partialPath, partialOwned);
    if (isAuthenticationError(error)) {
      throw new Error("artifact authentication failed", { cause: error });
    }
    throw error;
  }
}
