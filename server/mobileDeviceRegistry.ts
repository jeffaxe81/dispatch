/**
 * Strict validation shared by the MySQL authorization-code and session stores.
 * The caller must load the registry row under SELECT ... FOR UPDATE before
 * issuing a code, exchanging it or creating/reading a mobile session.
 *
 * This is not proof of device possession or an authorization endpoint.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MOBILE_DEVICE_IDENTIFIER_RE=/^[A-Za-z0-9_-]{16,128}$/;
export const MOBILE_DEVICE_HASH_RE=/^[0-9a-f]{64}$/;

export type RegisteredMobileDevice={
  deviceHash:string;
  userId:number;
  organizationId:number;
  teamId:number;
  registeredAtMs:number;
  revokedAtMs:number|null;
};

export type MobileDeviceScope={
  deviceHash:string;
  userId:number;
  organizationId:number;
  teamId:number;
  issuedAtMs:number;
};

function validId(value:number):boolean {
  return Number.isSafeInteger(value) && value>0;
}
function equalHex(a:string,b:string):boolean {
  if(!MOBILE_DEVICE_HASH_RE.test(a)||!MOBILE_DEVICE_HASH_RE.test(b))return false;
  return timingSafeEqual(Buffer.from(a,"ascii"),Buffer.from(b,"ascii"));
}

export function hashMobileDeviceIdentifier(deviceId:string):string {
  if(!MOBILE_DEVICE_IDENTIFIER_RE.test(deviceId))
    throw new Error("Identificador de dispositivo móvel inválido.");
  return createHash("sha256").update(deviceId,"ascii").digest("hex");
}

/** Only an active, previously enrolled exact principal/scope is trusted. */
export function assertRegisteredMobileDevice(
  record:RegisteredMobileDevice|null|undefined,
  scope:MobileDeviceScope,
):void {
  if(!record || record.revokedAtMs!==null ||
     !validId(record.userId)||!validId(record.organizationId)||!validId(record.teamId)||
     !validId(scope.userId)||!validId(scope.organizationId)||!validId(scope.teamId)||
     !Number.isSafeInteger(record.registeredAtMs)||record.registeredAtMs<=0||
     !Number.isSafeInteger(scope.issuedAtMs)||scope.issuedAtMs<record.registeredAtMs||
     !equalHex(record.deviceHash,scope.deviceHash)||
     record.userId!==scope.userId||
     record.organizationId!==scope.organizationId||
     record.teamId!==scope.teamId){
    throw new Error("Dispositivo móvel não cadastrado, revogado ou fora do escopo.");
  }
}

export function validateDeviceEnrollment(input:RegisteredMobileDevice):void {
  if(!MOBILE_DEVICE_HASH_RE.test(input.deviceHash) ||
     !validId(input.userId)||!validId(input.organizationId)||!validId(input.teamId)||
     !Number.isSafeInteger(input.registeredAtMs)||input.registeredAtMs<=0||
     input.revokedAtMs!==null)
    throw new Error("Cadastro de dispositivo móvel inválido.");
}
