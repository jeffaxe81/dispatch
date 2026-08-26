import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { accessRoles, auditLogs, userProfiles, userRoleAssignments, users } from "../drizzle/schema";
import { getDb } from "./db";
import { setUserLocalCredentials } from "./db";
import { getEffectiveAccess } from "./accessControl";
import { authenticateLocalRequest, createLocalSessionToken, hashLocalPassword, loginWithLocalCredentials, verifyLocalSessionToken } from "./localAuth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const suffix = `test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const dispatcherUsername = `dispatcher-${suffix}`;
const agentUsername = `agent-${suffix}`;
const createdUsername = `operador-${suffix}`;
const createdEmail = `operador-${suffix}@example.test`;
const password = "Senha-teste-local-2026";
let dispatcherId = 0;
let agentId = 0;
let provisionedId = 0;
let temporaryRoleId = 0;

async function callerFor(userId: number) {
  const token = await createLocalSessionToken(userId);
  const user = await authenticateLocalRequest({ headers: { cookie: `app_session_id=${token}` } } as any);
  if (!user) throw new Error("Sessão local de teste não foi reconhecida.");
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: (name: string, options: Record<string, unknown>) => cleared.push({ name, options }) } as TrpcContext["res"],
  };
  return { caller: appRouter.createCaller(ctx), cleared };
}

async function callerForCredentials(username: string, password: string) {
  const cookieCalls: Array<{ name: string; value: string }> = [];
  const loginCtx: TrpcContext = {
    user: null,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { cookie: (name: string, value: string) => cookieCalls.push({ name, value }) } as TrpcContext["res"],
  };
  const loggedIn = await appRouter.createCaller(loginCtx).auth.login({ username, password });
  const token = cookieCalls.find(cookie => cookie.name === "app_session_id")?.value;
  const user = await authenticateLocalRequest({ headers: { cookie: `app_session_id=${token}` } } as any);
  if (!user) throw new Error("Sessão emitida por auth.login não foi reconhecida.");
  const cleared: string[] = [];
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: (name: string) => cleared.push(name) } as TrpcContext["res"],
  };
  return { loggedIn, caller: appRouter.createCaller(ctx), cleared };
}

describe("integração de credenciais locais por perfil", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para teste integrado.");
    const passwordHash = await hashLocalPassword(password);
    const [dispatcher] = await db.insert(users).values({ openId: `local:${dispatcherUsername}`, username: dispatcherUsername, passwordHash, name: "Despachador de teste", loginMethod: "local_password", role: "user", operationalRole: "despachador", active: true }).$returningId();
    const [agent] = await db.insert(users).values({ openId: `local:${agentUsername}`, username: agentUsername, passwordHash, name: "Agente de teste", loginMethod: "local_password", role: "user", operationalRole: "agente", active: true }).$returningId();
    dispatcherId = dispatcher.id;
    agentId = agent.id;
    const [role] = await db.insert(accessRoles).values({ code: `teste_local_${suffix.replace(/[^a-z0-9_]/gi, "_")}`, name: "Perfil temporário local", defaultScope: "global", active: true }).$returningId();
    temporaryRoleId = role.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const ids = [dispatcherId, agentId, provisionedId].filter(Boolean);
    if (ids.length) {
      await db.delete(userRoleAssignments).where(inArray(userRoleAssignments.userId, ids));
      await db.delete(userProfiles).where(inArray(userProfiles.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    if (temporaryRoleId) await db.delete(accessRoles).where(eq(accessRoles.id, temporaryRoleId));
  });

  it("autentica despachador e agente, recupera a sessão e preserva o perfil", async () => {
    const dispatcher = await loginWithLocalCredentials({ username: dispatcherUsername, password });
    const agent = await loginWithLocalCredentials({ username: agentUsername, password });
    const token = await createLocalSessionToken(dispatcher.id);
    const session = await verifyLocalSessionToken(token);
    const request = { headers: { cookie: `app_session_id=${token}` } } as any;
    const fromRequest = await authenticateLocalRequest(request);

    expect(dispatcher.operationalRole).toBe("despachador");
    expect(agent.operationalRole).toBe("agente");
    expect(session).toEqual({ kind: "local", userId: dispatcher.id });
    expect(fromRequest?.id).toBe(dispatcher.id);
    await expect(getEffectiveAccess(dispatcher)).resolves.toMatchObject({ permissions: expect.arrayContaining(["occurrences.view", "dispatch.view"]) });
    await expect(getEffectiveAccess(agent)).resolves.toMatchObject({ permissions: expect.arrayContaining(["occurrences.view", "occurrences.transition"]) });
  });

  it("aplica procedimentos protegidos e logout com contexto local para despachador e agente", async () => {
    const dispatcher = await callerForCredentials(dispatcherUsername, password);
    const agent = await callerForCredentials(agentUsername, password);
    expect(dispatcher.loggedIn).toMatchObject({ id: dispatcherId, operationalRole: "despachador" });
    expect(agent.loggedIn).toMatchObject({ id: agentId, operationalRole: "agente" });
    await expect(dispatcher.caller.auth.me()).resolves.toMatchObject({ id: dispatcherId, operationalRole: "despachador" });
    await expect(agent.caller.auth.me()).resolves.toMatchObject({ id: agentId, operationalRole: "agente" });
    await expect(dispatcher.caller.incidents.list({ page: 1, pageSize: 10 })).resolves.toMatchObject({ rows: expect.any(Array), total: expect.any(Number) });
    await expect(agent.caller.incidents.list({ page: 1, pageSize: 10 })).resolves.toMatchObject({ rows: expect.any(Array), total: expect.any(Number) });
    await expect(dispatcher.caller.incidents.audit({ incidentId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(agent.caller.incidents.audit({ incidentId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(dispatcher.caller.teams.list()).resolves.toBeInstanceOf(Array);
    await expect(agent.caller.teams.list()).resolves.toBeInstanceOf(Array);
    await expect(dispatcher.caller.teams.create({ code: `D-${suffix}`, name: "Equipe negada", agency: "AXE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(agent.caller.teams.create({ code: `A-${suffix}`, name: "Equipe negada", agency: "AXE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(dispatcher.caller.access.setLocalCredentials({ userId: agentId, username: agentUsername, password })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(agent.caller.access.setLocalCredentials({ userId: dispatcherId, username: dispatcherUsername, password })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(dispatcher.caller.auth.logout()).resolves.toEqual({ success: true });
    await expect(agent.caller.auth.logout()).resolves.toEqual({ success: true });
    expect(dispatcher.cleared).toContain("app_session_id");
    expect(agent.cleared).toContain("app_session_id");
  });

  it("executa o ciclo administrativo de login, sessão, procedure protegido e logout", async () => {
    const username = process.env.LOCAL_AUTH_BOOTSTRAP_USERNAME ?? "";
    const password = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD ?? "";
    const cookieCalls: Array<{ name: string; value: string }> = [];
    const authCtx: TrpcContext = { user: null, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: { cookie: (name: string, value: string) => cookieCalls.push({ name, value }) } as TrpcContext["res"] };
    const loggedIn = await appRouter.createCaller(authCtx).auth.login({ username, password });
    const token = cookieCalls[0]?.value;
    const admin = await authenticateLocalRequest({ headers: { cookie: `app_session_id=${token}` } } as any);
    if (!admin) throw new Error("Sessão administrativa não foi reconhecida.");
    const cleared: string[] = [];
    const caller = appRouter.createCaller({ user: admin, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: { clearCookie: (name: string) => cleared.push(name) } as TrpcContext["res"] });
    await expect(caller.auth.me()).resolves.toMatchObject({ id: loggedIn.id, role: "admin" });
    await expect(caller.teams.list()).resolves.toBeInstanceOf(Array);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(cleared).toContain("app_session_id");
  });

  it("persiste falhas e bloqueia temporariamente após cinco senhas incorretas", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(loginWithLocalCredentials({ username: agentUsername, password: "senha-incorreta-2026" })).rejects.toThrow();
    }
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para teste integrado.");
    const persisted = (await db.select({ attempts: users.failedLoginAttempts, lockedUntil: users.lockedUntil }).from(users).where(eq(users.id, agentId)).limit(1))[0];
    expect(persisted?.attempts).toBe(5);
    expect(persisted?.lockedUntil).toBeInstanceOf(Date);
    await expect(loginWithLocalCredentials({ username: agentUsername, password })).rejects.toThrow("temporariamente bloqueado");
  });

  it("redefine a senha operacional sem expor hash e bloqueia redefinição por agente sem permissão", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para teste integrado.");
    const newPassword = "Nova-senha-local-2026";
    await setUserLocalCredentials({ userId: dispatcherId, username: dispatcherUsername, passwordHash: await hashLocalPassword(newPassword), actorUserId: dispatcherId });
    await expect(loginWithLocalCredentials({ username: dispatcherUsername, password })).rejects.toThrow("Usuário ou senha inválidos");
    await expect(loginWithLocalCredentials({ username: dispatcherUsername, password: newPassword })).resolves.toMatchObject({ id: dispatcherId, operationalRole: "despachador" });

    const agent = (await db.select().from(users).where(eq(users.id, agentId)).limit(1))[0];
    if (!agent) throw new Error("Agente de teste indisponível.");
    const ctx: TrpcContext = { user: agent, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    await expect(appRouter.createCaller(ctx).access.setLocalCredentials({ userId: dispatcherId, username: dispatcherUsername, password: newPassword })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("provisiona um usuário local pelo procedimento administrativo e permite sua autenticação", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para teste integrado.");
    const admin = (await db.select().from(users).where(eq(users.username, process.env.LOCAL_AUTH_BOOTSTRAP_USERNAME ?? "")).limit(1))[0];
    if (!admin) throw new Error("Administrador bootstrap indisponível.");
    const ctx: TrpcContext = { user: admin, req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] };
    const created = await appRouter.createCaller(ctx).access.createUser({ displayName: "Operador local de teste", email: createdEmail, username: createdUsername, password, operationalRole: "operador", active: true, teamId: null, roleId: temporaryRoleId, organizationId: null, organizationalUnitId: null, roleTeamId: null });
    provisionedId = created.id;
    await expect(loginWithLocalCredentials({ username: createdUsername, password })).resolves.toMatchObject({ id: created.id, operationalRole: "operador", loginMethod: "local_password" });
  });
});
