import { describe, expect, it } from "vitest";
import { validateProfilePhotoFile } from "./ProfilePhotoControl";

describe("validação da seleção de foto de perfil", () => {
  it("aceita imagens suportadas até o limite de 2 MB", () => {
    expect(validateProfilePhotoFile({ type: "image/png", size: 2 * 1024 * 1024 } as File)).toBeNull();
  });

  it("rejeita formatos e tamanhos não permitidos antes do envio", () => {
    expect(validateProfilePhotoFile({ type: "image/gif", size: 1024 } as File)).toMatch(/JPEG, PNG ou WEBP/);
    expect(validateProfilePhotoFile({ type: "image/jpeg", size: 2 * 1024 * 1024 + 1 } as File)).toMatch(/2 MB/);
  });
});
