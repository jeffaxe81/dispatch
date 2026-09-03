import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "./context";

// auth.login's Zod validation failure is representative of every
// procedure in appRouter: without a custom errorFormatter, tRPC would
// surface the raw ZodError (a JSON dump of issue objects) as error.message,
// which every page in the client renders directly to the user.
describe("errorFormatter", () => {
  let server: ReturnType<typeof createHTTPServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const ctx: TrpcContext = { user: null, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: { cookie: () => {} } as TrpcContext["res"] };
    server = createHTTPServer({ router: appRouter, createContext: async () => ctx });
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Falha ao iniciar servidor de teste.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("traduz uma falha de validação Zod em uma mensagem legível em vez do dump de issues", async () => {
    const response = await fetch(`${baseUrl}/auth.login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { username: "admin", password: "123" } }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.json.message).toBe("Senha: deve ter pelo menos 12 caracteres.");
    expect(body.error.json.message).not.toContain("origin");
    expect(body.error.json.message).not.toContain("[");
  });

  it("combina múltiplos campos inválidos em uma única mensagem", async () => {
    const response = await fetch(`${baseUrl}/auth.login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { username: "ab", password: "123" } }),
    });
    const body = await response.json();

    expect(body.error.json.message).toBe("Usuário: deve ter pelo menos 3 caracteres. Senha: deve ter pelo menos 12 caracteres.");
  });
});
