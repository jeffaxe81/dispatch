import { describe, expect, it } from "vitest";
import { decodeEvidenceBase64, MAX_EVIDENCE_BYTES } from "./db";

describe("evidências de ocorrência", () => {
  it("aceita um PDF com assinatura válida e preserva a extensão segura", () => {
    const dataBase64 = Buffer.from("%PDF-1.7\nconteudo").toString("base64");
    expect(decodeEvidenceBase64({ contentType: "application/pdf", dataBase64 })).toMatchObject({ extension: "pdf" });
  });

  it("rejeita conteúdo que não corresponde ao tipo de arquivo declarado", () => {
    const dataBase64 = Buffer.from("conteudo sem assinatura").toString("base64");
    expect(() => decodeEvidenceBase64({ contentType: "image/png", dataBase64 })).toThrow(/não corresponde/i);
  });

  it("rejeita formatos não permitidos e arquivos maiores que o limite", () => {
    expect(() => decodeEvidenceBase64({ contentType: "text/plain", dataBase64: Buffer.from("texto").toString("base64") })).toThrow(/JPEG, PNG, WEBP ou documentos PDF/i);
    const bytes = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_EVIDENCE_BYTES)]);
    expect(() => decodeEvidenceBase64({ contentType: "application/pdf", dataBase64: bytes.toString("base64") })).toThrow(/8 MB/i);
  });
});
