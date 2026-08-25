import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

describe("cookies de sessão", () => {
  it("usa SameSite Lax sem Secure no desenvolvimento HTTP", () => {
    expect(getSessionCookieOptions({ secure: false, protocol: "http" } as Request)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  });

  it("usa SameSite None com Secure em HTTPS", () => {
    expect(getSessionCookieOptions({ secure: true, protocol: "https" } as Request)).toMatchObject({ httpOnly: true, sameSite: "none", secure: true, path: "/" });
  });
});
