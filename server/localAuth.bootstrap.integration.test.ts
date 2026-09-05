import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { ensureLocalAdministrator } from "./localAuth";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

const username = process.env.LOCAL_AUTH_BOOTSTRAP_USERNAME ?? "";
const password = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD ?? "";

describe("bootstrap do administrador local", () => {
  beforeAll(async () => {
    expect(username).toMatch(/^[a-z0-9._-]{3,64}$/i);
    expect(password.length).toBeGreaterThanOrEqual(12);
    await ensureLocalAdministrator();
  });

  it("aceita as credenciais de implantação pelo procedimento de login e cria sessão HTTP-only", async () => {
    const cookieCalls: Array<{
      name: string;
      value: string;
      options: Record<string, unknown>;
    }> = [];
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        cookie: (
          name: string,
          value: string,
          options: Record<string, unknown>,
        ) => cookieCalls.push({ name, value, options }),
      } as TrpcContext["res"],
    };

    const result = await appRouter.createCaller(ctx).auth.login({
      username,
      password,
    });

    expect(result.username).toBe(username.toLowerCase());
    expect(result.role).toBe("admin");
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe(COOKIE_NAME);
    expect(cookieCalls[0]?.value.split(".")).toHaveLength(3);
    expect(cookieCalls[0]?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
  });
});
