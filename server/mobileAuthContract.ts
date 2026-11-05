/**
 * Native AXE Despacho authentication security contract, PRE-PRODUCTION ONLY.
 *
 * Pure validators; not wired into tRPC, and do not issue tokens or authorize
 * a request. A separate audited backend implementation, persistent sessions,
 * revocation, tenant checks and Android Keystore integration are mandatory
 * before enabling mobile login.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MOBILE_AUTH_PROTOCOL_VERSION = 1;
const STATE_RE = /^[A-Za-z0-9_-]{32,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE_RE = /^[A-Za-z0-9._~-]{32,256}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type MobileAuthorizationConfiguration = {
  enabled: boolean;
  clientId: string;
  issuer: string;
  redirectUri: string;
};

export type MobileAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  responseType: "code";
  codeChallengeMethod: "S256";
  codeChallenge: string;
  state: string;
};

export type NativeSessionBinding = {
  userId: number;
  organizationId: number;
  teamId: number;
  deviceId: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type NativeAccessRequest = {
  userId: number;
  organizationId: number;
  teamId: number;
  deviceId: string;
  userActive: boolean;
  role: string;
  serverAuthorizesOrganization: boolean;
  serverAuthorizesTeam: boolean;
};

function deny(): never {
  throw new Error("Contrato de autenticação móvel não autorizado.");
}

function secureRedirect(uri: string): URL {
  let url: URL;
  try { url = new URL(uri); } catch { return deny(); }
  if (url.protocol !== "https:" || !url.hostname ||
      url.username !== "" || url.password !== "" ||
      url.search !== "" || url.hash !== "" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.port !== "" || !url.pathname.startsWith("/") || url.pathname === "/" ||
      url.pathname.includes("//") || url.pathname.includes("/../")) return deny();
  return url;
}

function secureIssuer(uri: string): string {
  let url: URL;
  try { url = new URL(uri); } catch { return deny(); }
  if (url.protocol !== "https:" || !url.hostname ||
      url.username || url.password || url.search || url.hash ||
      url.port || url.pathname !== "/" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return deny();
  return url.origin;
}

function exactEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** RFC 7636 S256 challenge, with an RFC 7636-compatible verifier. */
export function pkceS256Challenge(verifier: string): string {
  if (!VERIFIER_RE.test(verifier)) return deny();
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) return false;
  return exactEqual(pkceS256Challenge(verifier), challenge);
}

/**
 * A server-side precondition for a *future* authorization-code endpoint.
 * This is not an endpoint and has no effect unless explicitly integrated.
 */
export function validateMobileAuthorizationRequest(
  input: MobileAuthorizationRequest,
  config: MobileAuthorizationConfiguration,
): void {
  if (config.enabled !== true || !config.clientId || !exactEqual(input.clientId, config.clientId))
    return deny();
  const registered = secureRedirect(config.redirectUri);
  if (input.redirectUri !== registered.href) return deny();
  secureIssuer(config.issuer);
  if (input.responseType !== "code" || input.codeChallengeMethod !== "S256" ||
      !CHALLENGE_RE.test(input.codeChallenge) || !STATE_RE.test(input.state)) return deny();
}

/**
 * Validates the Android App Link callback envelope only. A valid callback
 * does NOT grant a session; token exchange requires backend/device flow.
 * Require RFC 9207 issuer to prevent authorization-server mix-up.
 */
export function validateMobileCallback(
  callbackUri: string,
  expected: { redirectUri: string; state: string; issuer: string },
): string {
  const redirect = secureRedirect(expected.redirectUri);
  const issuer = secureIssuer(expected.issuer);
  let callback: URL;
  try { callback = new URL(callbackUri); } catch { return deny(); }
  if (callback.origin !== redirect.origin || callback.pathname !== redirect.pathname ||
      callback.username || callback.password || callback.hash) return deny();
  if (!STATE_RE.test(expected.state)) return deny();

  const keys = [...callback.searchParams.keys()];
  if (keys.length !== 3 ||
      keys.some(key => !["code", "state", "iss"].includes(key)) ||
      callback.searchParams.getAll("code").length !== 1 ||
      callback.searchParams.getAll("state").length !== 1 ||
      callback.searchParams.getAll("iss").length !== 1) return deny();

  const state = callback.searchParams.get("state") ?? "";
  const code = callback.searchParams.get("code") ?? "";
  const actualIssuer = callback.searchParams.get("iss") ?? "";
  if (!STATE_RE.test(state) || !exactEqual(state, expected.state) ||
      !CODE_RE.test(code) || !exactEqual(actualIssuer, issuer)) return deny();

  return code;
}

function positiveSafe(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Future per-request authorization precondition. Scope must be re-checked
 * against current DB permissions, never trusted from token claims alone.
 */
export function validateNativeSessionScope(
  binding: NativeSessionBinding,
  request: NativeAccessRequest,
  now = Date.now(),
): void {
  if (!positiveSafe(binding.userId) || !positiveSafe(binding.organizationId) ||
      !positiveSafe(binding.teamId) || !DEVICE_RE.test(binding.deviceId) ||
      !Number.isSafeInteger(binding.issuedAtMs) || binding.issuedAtMs < 0 ||
      !Number.isSafeInteger(binding.expiresAtMs) ||
      !Number.isSafeInteger(now) ||
      binding.issuedAtMs > now || binding.expiresAtMs <= now ||
      binding.expiresAtMs - binding.issuedAtMs > 15 * 60_000 ||
      !positiveSafe(request.userId) || !positiveSafe(request.organizationId) ||
      !positiveSafe(request.teamId) || !DEVICE_RE.test(request.deviceId) ||
      request.userActive !== true || request.role !== "agente" ||
      request.serverAuthorizesOrganization !== true || request.serverAuthorizesTeam !== true ||
      binding.userId !== request.userId ||
      binding.organizationId !== request.organizationId ||
      binding.teamId !== request.teamId ||
      !exactEqual(binding.deviceId, request.deviceId)) return deny();
}
