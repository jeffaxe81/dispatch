import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import { users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const scrypt = promisify(scryptCallback);
const LOCAL_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type LocalSession = { userId: number; kind: "local" };

function sessionKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function validateLocalPassword(password: string) {
  return password.length >= 12 && password.length <= 256;
}

export async function hashLocalPassword(password: string, salt = randomBytes(16).toString("base64url")) {
  if (!validateLocalPassword(password)) throw new Error("A senha deve ter entre 12 e 256 caracteres.");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyLocalPassword(password: string, encoded: string) {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "base64url");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function nextLoginFailure(currentAttempts: number, now = new Date()) {
  const failedLoginAttempts = currentAttempts + 1;
  return {
    failedLoginAttempts,
    lockedUntil: failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null,
  };
}

export async function createLocalSessionToken(userId: number) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ userId, kind: "local" satisfies LocalSession["kind"] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + Math.floor(LOCAL_SESSION_TTL_MS / 1000))
    .setIssuer("axe-dispatch-local")
    .setAudience("axe-dispatch")
    .sign(sessionKey());
}

export async function verifyLocalSessionToken(token: string | undefined | null): Promise<LocalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"], issuer: "axe-dispatch-local", audience: "axe-dispatch" });
    if (payload.kind !== "local" || typeof payload.userId !== "number" || !Number.isInteger(payload.userId)) return null;
    return { kind: "local", userId: payload.userId };
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string) {
  const raw = req.headers.cookie ?? "";
  return raw.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function authenticateLocalRequest(req: Request): Promise<User | null> {
  const session = await verifyLocalSessionToken(getCookie(req, COOKIE_NAME));
  if (!session) return null;
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const user = (await db.select().from(users).where(eq(users.id, session.userId)).limit(1))[0];
  return user?.active ? user : null;
}

export async function loginWithLocalCredentials(input: { username: string; password: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const username = normalizeUsername(input.username);
  const user = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  const invalidCredentials = new Error("Usuário ou senha inválidos.");
  if (!user || !user.active || !user.passwordHash) throw invalidCredentials;
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error("Acesso temporariamente bloqueado. Tente novamente mais tarde.");
  if (!(await verifyLocalPassword(input.password, user.passwordHash))) {
    const next = nextLoginFailure(user.failedLoginAttempts);
    await db.update(users).set(next).where(eq(users.id, user.id));
    throw invalidCredentials;
  }
  await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: new Date() }).where(eq(users.id, user.id));
  return user;
}

export async function ensureLocalAdministrator() {
  if (!ENV.localAdminUsername || !ENV.localAdminPassword) return;
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const username = normalizeUsername(ENV.localAdminUsername);
  const existing = (await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1))[0];
  if (existing) return;
  const passwordHash = await hashLocalPassword(ENV.localAdminPassword);
  await db.insert(users).values({
    openId: `local:${username}`,
    username,
    passwordHash,
    name: username,
    loginMethod: "local_password",
    role: "admin",
    operationalRole: "administrador",
    active: true,
  });
  console.log("[LocalAuth] Administrador inicial criado.");
}
