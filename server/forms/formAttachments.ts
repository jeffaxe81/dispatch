import { createHash, randomUUID } from "node:crypto";

export const MAX_FORM_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const FORM_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type FormAttachmentKind = "image" | "file" | "simple_signature";

export type FormAttachmentInput = { tenantId: number; submissionId: number; revisionId?: number | null; fieldKey: string; kind: FormAttachmentKind; fileName: string; mimeType: string; bytes: Buffer };
export type MalwareScanResult = { status: "clean" | "blocked" | "not_configured"; engine?: string };
export type MalwareScanner = { scan(input: { bytes: Buffer; fileName: string; mimeType: string }): Promise<MalwareScanResult> };
export type StoredObject = { key: string; url?: string };
export type AttachmentStorage = { storagePut(key: string, bytes: Buffer, mimeType: string): Promise<StoredObject> };

function safeFileName(name: string) { return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "attachment"; }

export function prepareFormAttachment(input: FormAttachmentInput) {
  if (input.bytes.byteLength > MAX_FORM_ATTACHMENT_BYTES) throw new Error("Anexo excede o tamanho máximo de 8 MiB.");
  if (!(FORM_ATTACHMENT_MIME_TYPES as readonly string[]).includes(input.mimeType)) throw new Error("Tipo MIME de anexo não permitido.");
  if (input.kind === "simple_signature" && input.mimeType !== "image/png") throw new Error("Assinatura simples deve ser armazenada exclusivamente como PNG.");
  if (input.kind === "image" && !input.mimeType.startsWith("image/")) throw new Error("Campo de imagem aceita somente MIME de imagem.");
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storageKey = `tenants/${input.tenantId}/forms/submissions/${input.submissionId}/${input.revisionId ?? "current"}/${input.fieldKey}/${randomUUID()}-${safeFileName(input.fileName)}`;
  return { ...input, sha256, storageKey, sizeBytes: input.bytes.byteLength };
}

export async function storeFormAttachment(input: FormAttachmentInput, ports: AttachmentStorage & { malwareScanner?: MalwareScanner }) {
  const prepared = prepareFormAttachment(input);
  const malwareScan = ports.malwareScanner ? await ports.malwareScanner.scan({ bytes: input.bytes, fileName: input.fileName, mimeType: input.mimeType }) : { status: "not_configured" as const };
  if (malwareScan.status === "blocked") throw new Error("Anexo bloqueado pela verificação antimalware.");
  const stored = await ports.storagePut(prepared.storageKey, input.bytes, input.mimeType);
  if (!stored?.key?.trim()) throw new Error("Storage não retornou a chave persistida do anexo.");
  return { storageKey: stored.key, sha256: prepared.sha256, sizeBytes: prepared.sizeBytes, mimeType: input.mimeType, fileName: input.fileName, kind: input.kind, malwareScan };
}
