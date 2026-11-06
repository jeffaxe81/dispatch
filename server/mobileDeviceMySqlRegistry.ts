/**
 * Dormant MySQL registry for administrator-approved native devices.
 *
 * All code/session adapters acquire the registered-device row lock before
 * mutating grants. Revocation takes the SAME lock then revokes pending codes
 * and all issued sessions in one transaction. This serializes approval and
 * revocation across backend instances when all callers use these adapters.
 * No routes currently import this module.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./dbLegacy";
import { mobileRegisteredDevices } from "./mobileDeviceRegistrySchema";
import { mobileAuthorizationCodes } from "./mobileAuthorizationCodeSchema";
import { mobileSessions } from "./mobileSessionSchema";
import {
  validateDeviceEnrollment, MOBILE_DEVICE_HASH_RE,
  type RegisteredMobileDevice,
} from "./mobileDeviceRegistry";

async function database() {
  const db=await getDb();
  if(!db)throw new Error("Banco de dispositivos móveis indisponível.");
  return db;
}
function checkNow(now:number):void {
  if(!Number.isSafeInteger(now)||now<=0)throw new Error("Relógio de revogação inválido.");
}

/**
 * Privileged provisioning only; permanently revoked hashes cannot be
 * reactivated by INSERT/UPSERT. No public enrollment endpoint exists.
 */
export async function registerApprovedMobileDevice(
  record:RegisteredMobileDevice,
):Promise<void> {
  validateDeviceEnrollment(record);
  const db=await database();
  await db.insert(mobileRegisteredDevices).values(record);
}

/**
 * Takes a device row lock, permanently marks the device revoked and
 * invalidates BOTH pending authorization codes and issued sessions.
 * No read-then-write outside a transaction. Unknown devices fail closed.
 */
export async function revokeRegisteredMobileDeviceHash(
  deviceHash:string,now=Date.now(),
):Promise<void> {
  checkNow(now);
  if(!MOBILE_DEVICE_HASH_RE.test(deviceHash))
    throw new Error("Hash de dispositivo móvel inválido.");
  const db=await database();
  await db.transaction(async tx=>{
    const device=(await tx.select().from(mobileRegisteredDevices)
      .where(eq(mobileRegisteredDevices.deviceHash,deviceHash))
      .limit(1).for("update"))[0];
    if(!device)throw new Error("Dispositivo móvel não cadastrado.");
    if(device.revokedAtMs===null) {
      await tx.update(mobileRegisteredDevices)
        .set({revokedAtMs:now})
        .where(and(eq(mobileRegisteredDevices.deviceHash,deviceHash),
          isNull(mobileRegisteredDevices.revokedAtMs)));
    }
    await tx.update(mobileAuthorizationCodes)
      .set({revokedAtMs:device.revokedAtMs??now})
      .where(and(eq(mobileAuthorizationCodes.deviceHash,deviceHash),
        isNull(mobileAuthorizationCodes.revokedAtMs)));
    await tx.update(mobileSessions)
      .set({revokedAtMs:device.revokedAtMs??now})
      .where(and(eq(mobileSessions.deviceHash,deviceHash),
        isNull(mobileSessions.revokedAtMs)));
  });
}
