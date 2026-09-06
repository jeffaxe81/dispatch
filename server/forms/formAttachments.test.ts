import { describe, expect, it, vi } from "vitest";
import { prepareFormAttachment, storeFormAttachment, MAX_FORM_ATTACHMENT_BYTES } from "./formAttachments";

const png = Buffer.from("assinatura-simples");

describe("D-008 attachment security", () => {
  it("limita anexos a 8 MiB", () => {
    expect(MAX_FORM_ATTACHMENT_BYTES).toBe(8 * 1024 * 1024);
    expect(() => prepareFormAttachment({ tenantId: 7, submissionId: 21, fieldKey: "foto", kind: "image", fileName: "x.png", mimeType: "image/png", bytes: Buffer.alloc(MAX_FORM_ATTACHMENT_BYTES + 1) })).toThrow(/8 MiB|tamanho/i);
  });

  it("aceita somente MIME aprovado", () => {
    expect(() => prepareFormAttachment({ tenantId: 7, submissionId: 21, fieldKey: "doc", kind: "file", fileName: "x.exe", mimeType: "application/x-msdownload", bytes: Buffer.from("x") })).toThrow(/mime|tipo/i);
  });

  it("restringe assinatura simples a PNG", () => {
    expect(() => prepareFormAttachment({ tenantId: 7, submissionId: 21, fieldKey: "assinatura", kind: "simple_signature", fileName: "sign.jpg", mimeType: "image/jpeg", bytes: png })).toThrow(/png/i);
  });

  it("gera SHA-256 e chave isolada por tenant/submissão", () => {
    const result = prepareFormAttachment({ tenantId: 7, submissionId: 21, fieldKey: "foto", kind: "image", fileName: "foto.png", mimeType: "image/png", bytes: png });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.storageKey).toContain("tenants/7/forms/submissions/21/");
  });

  it("expõe estado real do antimalware e não afirma proteção quando hook é no-op", async () => {
    const storagePut = vi.fn(async () => undefined);
    const result = await storeFormAttachment({ tenantId: 7, submissionId: 21, fieldKey: "foto", kind: "image", fileName: "foto.png", mimeType: "image/png", bytes: png }, { storagePut });
    expect(result.malwareScan.status).toBe("not_configured");
    expect(storagePut).toHaveBeenCalledOnce();
  });
});
