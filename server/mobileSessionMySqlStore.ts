/**
 * Dormant native session MySQL adapter. All new/active sessions require an
 * already-approved device with matching identity/tenant/team scope.
 *
 * Lock order is registered-device -> session, matching revocation. There is
 * no public endpoint, and all authorization checks on a future operational
 * route must still be DB-backed and performed at the action boundary.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "./dbLegacy";
import { mobileSessions } from "./mobileSessionSchema";
import { mobileRegisteredDevices } from "./mobileDeviceRegistrySchema";
import { assertRegisteredMobileDevice } from "./mobileDeviceRegistry";
import { revokeRegisteredMobileDeviceHash } from "./mobileDeviceMySqlRegistry";
import type { MobileSessionRow, MobileSessionStore } from "./mobileSessionService";

async function requiredDatabase() {
  const db=await getDb();
  if(!db)throw new Error("Banco de sessões móveis indisponível.");
  return db;
}
function assertSessionDevice(device:typeof mobileRegisteredDevices.$inferSelect|undefined,
  row:MobileSessionRow):void {
  assertRegisteredMobileDevice(device,{
    deviceHash:row.deviceHash,
    userId:row.userId,
    organizationId:row.organizationId,
    teamId:row.teamId,
    issuedAtMs:row.issuedAtMs,
  });
}
export function createMySqlMobileSessionStore():MobileSessionStore {
  return {
    async create(record:MobileSessionRow):Promise<void> {
      const db=await requiredDatabase();
      await db.transaction(async tx=>{
        // No session can be inserted after revocation commits, even if the
        // authorization code was spent just before the device was blocked.
        const device=(await tx.select().from(mobileRegisteredDevices)
          .where(eq(mobileRegisteredDevices.deviceHash,record.deviceHash))
          .limit(1).for("update"))[0];
        assertSessionDevice(device,record);
        await tx.insert(mobileSessions).values(record);
      });
    },
    async readActive(sessionHash:string,now:number):Promise<MobileSessionRow|null> {
      const db=await requiredDatabase();
      return db.transaction(async tx=>{
        // Unlocked lookup reveals only the device hash to acquire locks in
        // consistent order. Never authorize from this initial hint row.
        const hint=(await tx.select().from(mobileSessions)
          .where(eq(mobileSessions.sessionHash,sessionHash))
          .limit(1))[0];
        if(!hint)return null;
        const device=(await tx.select().from(mobileRegisteredDevices)
          .where(eq(mobileRegisteredDevices.deviceHash,hint.deviceHash))
          .limit(1).for("update"))[0];
        assertSessionDevice(device,hint);
        const row=(await tx.select().from(mobileSessions)
          .where(and(
            eq(mobileSessions.sessionHash,sessionHash),
            isNull(mobileSessions.revokedAtMs),
            gt(mobileSessions.expiresAtMs,now),
          )).limit(1).for("update"))[0];
        if(!row || row.deviceHash!==hint.deviceHash)return null;
        assertSessionDevice(device,row);
        return row;
      });
    },
    async revokeSession(sessionHash:string,now:number):Promise<void> {
      const db=await requiredDatabase();
      await db.update(mobileSessions).set({revokedAtMs:now})
        .where(and(eq(mobileSessions.sessionHash,sessionHash),
          isNull(mobileSessions.revokedAtMs)));
    },
    async revokeDevice(deviceHash:string,now:number):Promise<void> {
      await revokeRegisteredMobileDeviceHash(deviceHash,now);
    },
  };
}
