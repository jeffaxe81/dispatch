/**
 * Dormant PKCE authorization-code MySQL adapter.
 * Every issuance/exchange checks an already-approved mobile device under
 * the SAME row lock used for revocation, across all backend instances.
 * Database migration and verified system-browser auth are prerequisites.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./dbLegacy";
import { mobileAuthorizationCodes } from "./mobileAuthorizationCodeSchema";
import { mobileRegisteredDevices } from "./mobileDeviceRegistrySchema";
import { assertRegisteredMobileDevice } from "./mobileDeviceRegistry";
import { revokeRegisteredMobileDeviceHash } from "./mobileDeviceMySqlRegistry";
import type { MobileCodeRecord, MobileCodeStore } from "./mobileAuthCodes";

async function requireMobileDatabase() {
  const db=await getDb();
  if(!db)throw new Error("Armazenamento móvel indisponível.");
  return db;
}
function assertGrantDevice(device:typeof mobileRegisteredDevices.$inferSelect|undefined,
  grant:MobileCodeRecord):void {
  assertRegisteredMobileDevice(device,{
    deviceHash:grant.deviceHash,
    userId:grant.userId,
    organizationId:grant.organizationId,
    teamId:grant.teamId,
    issuedAtMs:grant.issuedAtMs,
  });
}
export function createMySqlMobileCodeStore():MobileCodeStore {
  return {
    async put(record:MobileCodeRecord) {
      const db=await requireMobileDatabase();
      await db.transaction(async tx=>{
        // Lock enrollment BEFORE inserting the code. A concurrent revoke
        // cannot interleave between checking the device and insertion.
        const device=(await tx.select().from(mobileRegisteredDevices)
          .where(eq(mobileRegisteredDevices.deviceHash,record.deviceHash))
          .limit(1).for("update"))[0];
        assertGrantDevice(device,record);
        await tx.insert(mobileAuthorizationCodes).values(record);
      });
    },
    async take(codeHash:string,now:number):Promise<MobileCodeRecord|null> {
      const db=await requireMobileDatabase();
      return db.transaction(async tx=>{
        // The first read is only a hint to identify the device, not an
        // authorization decision. Acquire locks in device -> code order.
        const hint=(await tx.select().from(mobileAuthorizationCodes)
          .where(eq(mobileAuthorizationCodes.codeHash,codeHash))
          .limit(1))[0];
        if(!hint)return null;
        const device=(await tx.select().from(mobileRegisteredDevices)
          .where(eq(mobileRegisteredDevices.deviceHash,hint.deviceHash))
          .limit(1).for("update"))[0];
        // A now-revoked/unknown device always fails closed.
        assertGrantDevice(device,hint);
        const found=(await tx.select().from(mobileAuthorizationCodes)
          .where(eq(mobileAuthorizationCodes.codeHash,codeHash))
          .limit(1).for("update"))[0];
        if(!found || found.deviceHash!==hint.deviceHash ||
           found.consumedAtMs!==null || found.revokedAtMs!==null ||
           found.expiresAtMs<=now || found.issuedAtMs>now)return null;
        assertGrantDevice(device,found);
        await tx.update(mobileAuthorizationCodes)
          .set({consumedAtMs:now})
          .where(and(eq(mobileAuthorizationCodes.codeHash,codeHash),
            isNull(mobileAuthorizationCodes.consumedAtMs),
            isNull(mobileAuthorizationCodes.revokedAtMs)));
        return {...found,consumedAtMs:now};
      });
    },
    async revokeDevice(deviceHash:string,now:number):Promise<void> {
      // Revocation always covers registrations, pending codes AND issued
      // sessions. It must not leave a path to issue a new code later.
      await revokeRegisteredMobileDeviceHash(deviceHash,now);
    }
  };
}
