/**
 * Dormant native mobile session service. No route imports these functions:
 * its "handle" is not an operationally supported bearer token.
 *
 * A future audited route may call issueSessionAfterCodeRedemption only after
 * device consent, an authenticated system-browser PKCE flow, current DB-backed
 * authorization, rate limits and a verified Android Keystore bridge.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  redeemMobileAuthorizationCode,
  type MobileCodeStore,
} from "./mobileAuthCodes";
import {
  validateNativeSessionScope,
  type NativeAccessRequest,
  type NativeSessionBinding,
} from "./mobileAuthContract";

export const MOBILE_SESSION_TTL_MS = 15 * 60_000;
const HANDLE_RE = /^[A-Za-z0-9_-]{43}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type MobileSessionRow = {
  sessionHash: string;
  deviceHash: string;
  userId: number;
  organizationId: number;
  teamId: number;
  issuedAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
};

/**
 * MUST read the committed MySQL state at every verification, never use a
 * process-local cache. Database outages fail closed.
 */
export interface MobileSessionStore {
  create(record: MobileSessionRow): Promise<void>;
  readActive(sessionHash: string, now: number): Promise<MobileSessionRow | null>;
  revokeSession(sessionHash: string, now: number): Promise<void>;
  revokeDevice(deviceHash: string, now: number): Promise<void>;
}

function deny(): never {
  throw new Error("Sessão móvel não autorizada, revogada ou expirada.");
}
function checkNow(now: number): void {
  if (!Number.isSafeInteger(now) || now<=0 ||
      now>Number.MAX_SAFE_INTEGER-MOBILE_SESSION_TTL_MS)deny();
}
function hash(value: string): string {
  return createHash("sha256").update(value, "ascii").digest("hex");
}
function equal(a: string, b: string): boolean {
  const left=Buffer.from(a, "ascii");
  const right=Buffer.from(b, "ascii");
  return left.length===right.length && timingSafeEqual(left,right);
}

/**
 * Redeems the single-use authorization code *before* creating a session.
 * Failed session persistence does not restore the spent authorization code.
 * Returned handle must never be exposed to WebView JS, logs or localStorage.
 */
export async function issueSessionAfterCodeRedemption(
  codes: MobileCodeStore,
  sessions: MobileSessionStore,
  input: {code:string;codeVerifier:string;clientId:string;redirectUri:string},
  principal: NativeAccessRequest,
  now=Date.now(),
): Promise<{ handle:string; expiresAtMs:number }> {
  checkNow(now);
  const binding=await redeemMobileAuthorizationCode(codes,input,principal,now);
  validateNativeSessionScope(binding,principal,now);
  const handle=randomBytes(32).toString("base64url");
  const record:MobileSessionRow={
    sessionHash:hash(handle),
    deviceHash:hash(principal.deviceId),
    userId:binding.userId,
    organizationId:binding.organizationId,
    teamId:binding.teamId,
    issuedAtMs:binding.issuedAtMs,
    expiresAtMs:binding.expiresAtMs,
    revokedAtMs:null,
  };
  await sessions.create(record);
  return {handle,expiresAtMs:record.expiresAtMs};
}

/**
 * A verified row alone is insufficient: principal MUST be freshly obtained
 * from the central's active DB permission/tenant/team checks, not sent as
 * authorization flags from Android. A revoked/expired/mismatched row fails.
 */
export async function verifyMobileSession(
  sessions: MobileSessionStore,
  handle: string,
  principal: NativeAccessRequest,
  now=Date.now(),
): Promise<NativeSessionBinding> {
  checkNow(now);
  if (!HANDLE_RE.test(handle) || !DEVICE_RE.test(principal.deviceId))deny();
  const record=await sessions.readActive(hash(handle),now);
  if (!record || record.revokedAtMs!==null ||
      !Number.isSafeInteger(record.issuedAtMs) ||
      !Number.isSafeInteger(record.expiresAtMs) ||
      record.expiresAtMs<=now || record.issuedAtMs>now ||
      record.expiresAtMs-record.issuedAtMs>MOBILE_SESSION_TTL_MS ||
      !equal(record.deviceHash,hash(principal.deviceId)))deny();
  const binding:NativeSessionBinding={
    userId:record.userId,
    organizationId:record.organizationId,
    teamId:record.teamId,
    deviceId:principal.deviceId,
    issuedAtMs:record.issuedAtMs,
    expiresAtMs:record.expiresAtMs,
  };
  validateNativeSessionScope(binding,principal,now);
  return binding;
}

export async function revokeMobileSession(
  sessions: MobileSessionStore,handle:string,now=Date.now(),
):Promise<void> {
  checkNow(now);
  if(!HANDLE_RE.test(handle))deny();
  await sessions.revokeSession(hash(handle),now);
}

export async function revokeMobileDeviceSessions(
  sessions: MobileSessionStore,deviceId:string,now=Date.now(),
):Promise<void> {
  checkNow(now);
  if(!DEVICE_RE.test(deviceId))deny();
  await sessions.revokeDevice(hash(deviceId),now);
}
