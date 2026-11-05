/**
 * MySQL-backed dormant mobile session store.
 * No routes call this module. Requires an independently reviewed migration
 * of mobile_sessions before a backend authorization endpoint is enabled.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "./dbLegacy";
import { mobileSessions } from "./mobileSessionSchema";
import type { MobileSessionRow, MobileSessionStore } from "./mobileSessionService";

async function requiredDatabase() {
  const db=await getDb();
  if (!db)throw new Error("Banco de sessões móveis indisponível.");
  return db;
}

export function createMySqlMobileSessionStore():MobileSessionStore {
  return {
    async create(record:MobileSessionRow):Promise<void> {
      const db=await requiredDatabase();
      // A cryptographically random handle is represented only by this
      // SHA-256 hash. Primary-key collisions fail the entire operation.
      await db.insert(mobileSessions).values(record);
    },
    async readActive(sessionHash:string,now:number):Promise<MobileSessionRow|null> {
      const db=await requiredDatabase();
      // Serialize a verification read with concurrent revoke operations on
      // the matching row. Never serve a cached or replica-stale session.
      return db.transaction(async tx=>{
        const row=(await tx.select().from(mobileSessions)
          .where(and(
            eq(mobileSessions.sessionHash,sessionHash),
            isNull(mobileSessions.revokedAtMs),
            gt(mobileSessions.expiresAtMs,now),
          )).limit(1).for("update"))[0];
        return row??null;
      });
    },
    async revokeSession(sessionHash:string,now:number):Promise<void> {
      const db=await requiredDatabase();
      await db.update(mobileSessions).set({revokedAtMs:now})
        .where(and(eq(mobileSessions.sessionHash,sessionHash),
          isNull(mobileSessions.revokedAtMs)));
    },
    async revokeDevice(deviceHash:string,now:number):Promise<void> {
      const db=await requiredDatabase();
      await db.update(mobileSessions).set({revokedAtMs:now})
        .where(and(eq(mobileSessions.deviceHash,deviceHash),
          isNull(mobileSessions.revokedAtMs)));
    },
  };
}
