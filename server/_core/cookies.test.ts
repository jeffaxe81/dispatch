import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

describe("cookies de sessão", () => {
  it("usa SameSite Lax sem Secure no desenvolvimento HTTP", () => {
    expect(getSessionCookieOptions({ secure: false, protocol: "http" } as Request)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  });

  it("usa SameSite Lax com Secure em HTTPS e não envia cookie em contextos cross-site", () => {
    expect(getSessionCookieOptions({ secure: true, protocol: "https" } as Request)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });

  it("não promove o cookie a SameSite None só por confiar no proxy TLS", () => {
    expect(getSessionCookieOptions({ secure: false, protocol: "https" } as Request)).toMatchObject({ sameSite: "lax", secure: true });
    expect(getSessionCookieOptions({ secure: true, protocol: "http" } as Request)).toMatchObject({ sameSite: "lax", secure: true });
  });
});
