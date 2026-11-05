/**
 * One-time native authorization code service, intentionally not exposed by
 * any route. A successful redemption returns ONLY a candidate binding; it
 * does not create a token, session or operational authorization.
 *
 * The store MUST atomically consume a code across all backend replicas.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  validateMobileAuthorizationRequest, validateNativeSessionScope,
  verifyPkceS256,
  type MobileAuthorizationConfiguration, type MobileAuthorizationRequest,
  type NativeAccessRequest, type NativeSessionBinding,
} from "./mobileAuthContract";

export const MOBILE_AUTH_CODE_TTL_MS = 2 * 60_000;
export const MOBILE_ACCESS_CANDIDATE_TTL_MS = 15 * 60_000;
const CODE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type MobileCodeRecord = {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: number;
  organizationId: number;
  teamId: number;
  deviceHash: string;
  issuedAtMs: number;
  expiresAtMs: number;
  consumedAtMs: number | null;
  revokedAtMs: number | null;
};

/**
 * take() MUST use a database transaction with SELECT ... FOR UPDATE,
 * verify the row is not consumed/revoked/expired and mark it consumed
 * before commit. Do not implement with read-then-write across transactions.
 */
export interface MobileCodeStore {
  put(record: MobileCodeRecord): Promise<void>;
  take(codeHash: string, now: number): Promise<MobileCodeRecord | null>;
  revokeDevice(deviceHash: string, now: number): Promise<void>;
}

function deny(): never {
  throw new Error("Código móvel inválido, expirado, revogado ou já utilizado.");
}
function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function checkClock(now:number):void {
  if (!Number.isSafeInteger(now) || now <= 0 ||
      now + MOBILE_ACCESS_CANDIDATE_TTL_MS > Number.MAX_SAFE_INTEGER) deny();
}
function digest(value:string):string {
  return createHash("sha256").update(value, "ascii").digest("hex");
}
function equal(a:string,b:string):boolean {
  const l=Buffer.from(a,"ascii"),r=Buffer.from(b,"ascii");
  return l.length===r.length && timingSafeEqual(l,r);
}

export async function issueMobileAuthorizationCode(
  store:MobileCodeStore,
  request:MobileAuthorizationRequest,
  config:MobileAuthorizationConfiguration,
  actor:NativeAccessRequest,
  now=Date.now(),
):Promise<{ code:string; expiresAtMs:number }> {
  checkClock(now);
  validateMobileAuthorizationRequest(request,config);
  if (!DEVICE_RE.test(actor.deviceId))deny();

  // This uses only DB-derived role/authorization flags provided by the caller.
  // An actual endpoint MUST fetch them directly from the authenticated
  // server-side context, not from JSON supplied by a mobile client.
  const expiresAtMs=now+MOBILE_AUTH_CODE_TTL_MS;
  validateNativeSessionScope({
    userId:actor.userId,organizationId:actor.organizationId,
    teamId:actor.teamId,deviceId:actor.deviceId,
    issuedAtMs:now,expiresAtMs
  },actor,now);

  const code=randomBytes(32).toString("base64url");
  const record:MobileCodeRecord={
    codeHash:digest(code),
    clientId:request.clientId,
    redirectUri:request.redirectUri,
    codeChallenge:request.codeChallenge,
    userId:actor.userId,
    organizationId:actor.organizationId,
    teamId:actor.teamId,
    deviceHash:digest(actor.deviceId),
    issuedAtMs:now,expiresAtMs,
    consumedAtMs:null,revokedAtMs:null,
  };
  await store.put(record);
  return {code,expiresAtMs};
}

export async function redeemMobileAuthorizationCode(
  store:MobileCodeStore,
  input:{code:string;codeVerifier:string;clientId:string;redirectUri:string},
  principal:NativeAccessRequest,
  now=Date.now(),
):Promise<NativeSessionBinding> {
  checkClock(now);
  if (!CODE_RE.test(input.code) || !VERIFIER_RE.test(input.codeVerifier) ||
      !input.clientId || !input.redirectUri || !DEVICE_RE.test(principal.deviceId))deny();
  // The store destroys the code's redeemability in a single transaction
  // before the PKCE/identity checks. Failed attempts do not restore it.
  const record=await store.take(digest(input.code),now);
  if (!record || !HASH_RE.test(record.codeHash) ||
      record.consumedAtMs !== now || record.revokedAtMs !== null ||
      record.issuedAtMs > now || record.expiresAtMs <= now ||
      record.expiresAtMs-record.issuedAtMs > MOBILE_AUTH_CODE_TTL_MS ||
      !equal(record.clientId,input.clientId) ||
      !equal(record.redirectUri,input.redirectUri) ||
      !verifyPkceS256(input.codeVerifier,record.codeChallenge) ||
      !equal(record.deviceHash,digest(principal.deviceId))) deny();

  const binding:NativeSessionBinding={
    userId:record.userId,
    organizationId:record.organizationId,
    teamId:record.teamId,
    deviceId:principal.deviceId,
    issuedAtMs:now,
    expiresAtMs:now+MOBILE_ACCESS_CANDIDATE_TTL_MS
  };
  validateNativeSessionScope(binding,principal,now);
  return binding;
}

export async function revokePendingMobileCodesForDevice(
  store:MobileCodeStore,deviceId:string,now=Date.now(),
):Promise<void> {
  checkClock(now);
  if (!DEVICE_RE.test(deviceId))deny();
  await store.revokeDevice(digest(deviceId),now);
}
