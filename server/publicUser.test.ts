import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setDbForTesting, listUsersForAdministration, listUsersWithAccess } from "./db";
import { publicUserColumns, toPublicUser } from "./publicUser";
import type { User } from "../drizzle/schema";

function fakeDb() {
  const shapes: Array<Record<string, any>> = [];
  const chain: any = { from: () => chain, leftJoin: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain, limit: () => chain, offset: () => chain, then: (done: (rows: unknown[]) => unknown) => done([]) };
  return { shapes, db: { select: vi.fn((shape?: Record<string, any>) => { if (shape) shapes.push(shape); return chain; }) } as any };
}

afterEach(() => setDbForTesting(null));

describe("hash de senha fora das respostas da API", () => {
  it("remove somente o hash da resposta de auth.me", () => {
    const user = { id: 7, name: "Ana", passwordHash: "scrypt$segredo", failedLoginAttempts: 2 } as unknown as User;
    const result = toPublicUser(user);
    expect(result).toEqual({ id: 7, name: "Ana", failedLoginAttempts: 2 });
    expect(JSON.stringify(result)).not.toContain("segredo");
    expect(toPublicUser(null)).toBeNull();
  });

  it("não inclui a coluna de hash no conjunto público", () => {
    expect(publicUserColumns).not.toHaveProperty("passwordHash");
    expect(publicUserColumns).toHaveProperty("id");
    expect(publicUserColumns).toHaveProperty("username");
  });

  it("administration.users não seleciona o hash", async () => {
    const { db, shapes } = fakeDb();
    setDbForTesting(db);
    await listUsersForAdministration();
    expect(shapes[0]?.user).toBeDefined();
    expect(shapes[0]?.user).not.toHaveProperty("passwordHash");
  });

  it("access.users não seleciona o hash", async () => {
    const { db, shapes } = fakeDb();
    setDbForTesting(db);
    await listUsersWithAccess({ page: 1, pageSize: 10 });
    const userShape = shapes.find(shape => shape.user);
    expect(userShape?.user).toBeDefined();
    expect(userShape?.user).not.toHaveProperty("passwordHash");
  });

  it("auth.me passa pela remoção do hash", () => {
    const source = readFileSync(resolve(import.meta.dirname, "routers.ts"), "utf8");
    expect(source).toContain("me: publicProcedure.query(opts => toPublicUser(opts.ctx.user))");
  });
});
