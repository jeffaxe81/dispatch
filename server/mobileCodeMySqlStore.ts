/**
 * Durable MySQL adapter for the dormant native-authorization code protocol.
 * The table migration must be separately applied and audited before an
 * endpoint is permitted to use this repository.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./dbLegacy";
import { mobileAuthorizationCodes } from "./mobileAuthorizationCodeSchema";
import type { MobileCodeRecord, MobileCodeStore } from "./mobileAuthCodes";

async function requireMobileDatabase() {
  const db=await getDb();
  if(!db)throw new Error("Armazenamento móvel indisponível.");
  return db;
}

export function createMySqlMobileCodeStore():MobileCodeStore {
  return {
    async put(record:MobileCodeRecord) {
      const db=await requireMobileDatabase();
      // Primary key: UNIQUE codeHash, so duplicate random code fails closed.
      await db.insert(mobileAuthorizationCodes).values(record);
    },
    async take(codeHash:string,now:number):Promise<MobileCodeRecord|null> {
      const db=await requireMobileDatabase();
      return db.transaction(async tx=>{
        // Row lock serializes exchange attempts across all MySQL connections
        // and application replicas, not just in one Node process.
        const found=(await tx.select().from(mobileAuthorizationCodes)
          .where(eq(mobileAuthorizationCodes.codeHash,codeHash))
          .limit(1).for("update"))[0];
        if(!found || found.consumedAtMs!==null || found.revokedAtMs!==null ||
           found.expiresAtMs<=now || found.issuedAtMs>now)return null;
        await tx.update(mobileAuthorizationCodes)
          .set({consumedAtMs:now})
          .where(and(eq(mobileAuthorizationCodes.codeHash,codeHash),
            isNull(mobileAuthorizationCodes.consumedAtMs),
            isNull(mobileAuthorizationCodes.revokedAtMs)));
        return {...found,consumedAtMs:now};
      });
    },
    async revokeDevice(deviceHash:string,now:number):Promise<void> {
      const db=await requireMobileDatabase();
      // A row already consumed stays consumed; all unused device grants
      // become permanently unusable. Access-token/session revocation is
      // a separate backend dependency, NOT implemented here.
      await db.update(mobileAuthorizationCodes)
        .set({revokedAtMs:now})
        .where(and(eq(mobileAuthorizationCodes.deviceHash,deviceHash),
          isNull(mobileAuthorizationCodes.revokedAtMs),
          isNull(mobileAuthorizationCodes.consumedAtMs)));
    }
  };
}
