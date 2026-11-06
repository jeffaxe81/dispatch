import { beforeEach, describe, expect, it, vi } from "vitest";
import { mobileRegisteredDevices } from "./mobileDeviceRegistrySchema";
import { mobileAuthorizationCodes } from "./mobileAuthorizationCodeSchema";
import { mobileSessions } from "./mobileSessionSchema";
import { hashMobileDeviceIdentifier } from "./mobileDeviceRegistry";
import { createMySqlMobileCodeStore } from "./mobileCodeMySqlStore";
import { createMySqlMobileSessionStore } from "./mobileSessionMySqlStore";
import { revokeRegisteredMobileDeviceHash } from "./mobileDeviceMySqlRegistry";
import type { MobileCodeRecord } from "./mobileAuthCodes";
import type { MobileSessionRow } from "./mobileSessionService";

const {dbRef}=vi.hoisted(()=>({dbRef:{current:null as unknown}}));
vi.mock("./dbLegacy",()=>({getDb:vi.fn(async()=>dbRef.current)}));

const now=1_800_000_000_000;
const deviceHash=hashMobileDeviceIdentifier("DEVICE_TEST_UUID_ABC_12345");
const codeHash="a".repeat(64);
const sessionHash="b".repeat(64);
const active={
  deviceHash,userId:11,organizationId:22,teamId:33,
  registeredAtMs:now-10_000,revokedAtMs:null as number|null,
};
const grant:MobileCodeRecord={
  codeHash,clientId:"axe-despacho-android",
  redirectUri:"https://app.axe.example/mobile/oauth/callback",
  codeChallenge:"A".repeat(43),userId:11,organizationId:22,
  teamId:33,deviceHash,issuedAtMs:now-200,
  expiresAtMs:now+100_000,consumedAtMs:null,revokedAtMs:null,
};
const session:MobileSessionRow={
  sessionHash,deviceHash,userId:11,organizationId:22,teamId:33,
  issuedAtMs:now-100,expiresAtMs:now+600_000,revokedAtMs:null,
};

/** Fake query adapter: tests *the real MySQL adapter lock/check wiring*.
 * This does not replace transactional integration against two MySQL sockets.
 */
function simulatedDb(options:{
  device?:typeof active|null;
  code?:MobileCodeRecord|null;
  session?:MobileSessionRow|null;
  failUpdate?:boolean;
}={}) {
  let device=options.device===undefined?{...active}:options.device?{...options.device}:null;
  let code=options.code===undefined?{...grant}:options.code?{...options.code}:null;
  let entry=options.session===undefined?{...session}:options.session?{...options.session}:null;
  const calls:string[]=[];
  const selected=(table:unknown)=>{
    if(table===mobileRegisteredDevices)return device?[{...device}]:[];
    if(table===mobileAuthorizationCodes)return code?[{...code}]:[];
    if(table===mobileSessions)return entry?[{...entry}]:[];
    throw new Error("Unexpected database table");
  };
  const type=(table:unknown)=>table===mobileRegisteredDevices?"device":
    table===mobileAuthorizationCodes?"code":
    table===mobileSessions?"session":"other";
  const tx={
    select:()=>({
      from:(table:unknown)=>({
        where:()=>({
          limit:()=>({
            for:async (mode:string)=>{calls.push("lock:"+type(table)+":"+mode);return selected(table);},
            then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>
              Promise.resolve(selected(table)).then(resolve,reject),
          }),
        }),
      }),
    }),
    insert:(table:unknown)=>({
      values:async(record:unknown)=>{
        calls.push("insert:"+type(table));
        if(table===mobileAuthorizationCodes)code={...(record as MobileCodeRecord)};
        if(table===mobileSessions)entry={...(record as MobileSessionRow)};
        if(table===mobileRegisteredDevices)device={...(record as typeof active)};
      },
    }),
    update:(table:unknown)=>({
      set:(patch:Record<string,unknown>)=>({
        where:async()=>{
          calls.push("update:"+type(table));
          if(options.failUpdate&&table===mobileSessions)throw new Error("MySQL write failed");
          if(table===mobileRegisteredDevices&&device&&device.revokedAtMs===null)
            device={...device,...patch};
          if(table===mobileAuthorizationCodes&&code){
            if(patch.revokedAtMs!==undefined&&code.revokedAtMs===null)code={...code,...patch};
            if(patch.consumedAtMs!==undefined&&code.consumedAtMs===null)code={...code,...patch};
          }
          if(table===mobileSessions&&entry&&entry.revokedAtMs===null)entry={...entry,...patch};
        },
      }),
    }),
  };
  const database={
    transaction:async <T>(fn:(t:typeof tx)=>Promise<T>)=>{
      calls.push("BEGIN");
      const before={device:device?{...device}:null,code:code?{...code}:null,entry:entry?{...entry}:null};
      try {const result=await fn(tx);calls.push("COMMIT");return result;}
      catch(error){device=before.device;code=before.code;entry=before.entry;calls.push("ROLLBACK");throw error;}
    },
    insert:tx.insert,
    update:tx.update,
  };
  dbRef.current=database;
  return {
    calls,
    get device(){return device;},
    get code(){return code;},
    get session(){return entry;},
  };
}

beforeEach(()=>{dbRef.current=null;});

describe("MySQL mobile device gate (adapter-level query/locking tests)",()=>{
  it("locks registered device before inserting an authorization code",async()=>{
    const db=simulatedDb({code:null});
    await createMySqlMobileCodeStore().put(grant);
    expect(db.calls).toEqual(["BEGIN","lock:device:update","insert:code","COMMIT"]);
    expect(db.code).toMatchObject({codeHash,userId:11,teamId:33});
  });
  it("cannot issue a new code after device revocation",async()=>{
    const db=simulatedDb({device:{...active,revokedAtMs:now-1},code:null});
    await expect(createMySqlMobileCodeStore().put(grant)).rejects.toThrow(/revogado/);
    expect(db.calls).toEqual(["BEGIN","lock:device:update","ROLLBACK"]);
    expect(db.code).toBeNull();
  });
  it("cannot issue a code to an unregistered device or a different team",async()=>{
    for(const input of [
      {device:null}, {device:{...active,organizationId:99}},
      {device:{...active,teamId:99}}, {device:{...active,userId:99}},
    ]){
      const db=simulatedDb({...input,code:null});
      await expect(createMySqlMobileCodeStore().put(grant)).rejects.toThrow();
      expect(db.calls).not.toContain("insert:code");
    }
  });
  it("locks device before consuming the code, rechecking its scope",async()=>{
    const db=simulatedDb();
    const consumed=await createMySqlMobileCodeStore().take(codeHash,now);
    expect(consumed?.consumedAtMs).toBe(now);
    expect(db.calls.slice(0,4)).toEqual(["BEGIN","lock:device:update","lock:code:update","update:code"]);
  });
  it("refuses code consumption when the owning device has been revoked",async()=>{
    const db=simulatedDb({device:{...active,revokedAtMs:now-2}});
    await expect(createMySqlMobileCodeStore().take(codeHash,now)).rejects.toThrow(/revogado/);
    expect(db.calls).not.toContain("update:code");
    expect(db.code?.consumedAtMs).toBeNull();
  });
  it("locks registered device before inserting a native session",async()=>{
    const db=simulatedDb({session:null});
    await createMySqlMobileSessionStore().create(session);
    expect(db.calls).toEqual(["BEGIN","lock:device:update","insert:session","COMMIT"]);
  });
  it("prevents a redeemed code from creating a session after revocation",async()=>{
    const db=simulatedDb({device:{...active,revokedAtMs:now-2},session:null});
    await expect(createMySqlMobileSessionStore().create(session)).rejects.toThrow(/revogado/);
    expect(db.calls).not.toContain("insert:session");
    expect(db.session).toBeNull();
  });
  it("locks device first on session reads, not just a session row",async()=>{
    const db=simulatedDb();
    const verified=await createMySqlMobileSessionStore().readActive(sessionHash,now);
    expect(verified?.sessionHash).toBe(sessionHash);
    expect(db.calls).toEqual(["BEGIN","lock:device:update","lock:session:update","COMMIT"]);
  });
  it("refuses sessions already issued when the device registry is revoked",async()=>{
    const db=simulatedDb({device:{...active,revokedAtMs:now-2}});
    await expect(createMySqlMobileSessionStore().readActive(sessionHash,now))
      .rejects.toThrow(/revogado/);
    expect(db.calls).not.toContain("lock:session:update");
  });
  it("permanently revokes enrollment, codes and sessions in one transaction",async()=>{
    const db=simulatedDb();
    await revokeRegisteredMobileDeviceHash(deviceHash,now);
    expect(db.calls).toEqual([
      "BEGIN","lock:device:update","update:device","update:code","update:session","COMMIT"
    ]);
    expect(db.device?.revokedAtMs).toBe(now);
    expect(db.code?.revokedAtMs).toBe(now);
    expect(db.session?.revokedAtMs).toBe(now);
    await expect(createMySqlMobileCodeStore().put(grant)).rejects.toThrow();
    await expect(createMySqlMobileSessionStore().create(session)).rejects.toThrow();
  });
  it("does not partially revoke if an update fails mid-transaction",async()=>{
    const db=simulatedDb({failUpdate:true});
    await expect(revokeRegisteredMobileDeviceHash(deviceHash,now)).rejects.toThrow("MySQL write failed");
    expect(db.calls.at(-1)).toBe("ROLLBACK");
    expect(db.device?.revokedAtMs).toBeNull();
    expect(db.code?.revokedAtMs).toBeNull();
    expect(db.session?.revokedAtMs).toBeNull();
  });
  it("fails closed on missing registration without touching pending grants",async()=>{
    const db=simulatedDb({device:null});
    await expect(revokeRegisteredMobileDeviceHash(deviceHash,now)).rejects.toThrow(/não cadastrado/);
    expect(db.calls).toEqual(["BEGIN","lock:device:update","ROLLBACK"]);
    expect(db.code?.revokedAtMs).toBeNull();
  });
  it("routes either device-revocation API through the full atomic revoker",async()=>{
    const db=simulatedDb();
    await createMySqlMobileCodeStore().revokeDevice(deviceHash,now);
    expect(db.device?.revokedAtMs).toBe(now);
    expect(db.session?.revokedAtMs).toBe(now);
    expect(db.code?.revokedAtMs).toBe(now);
    await createMySqlMobileSessionStore().revokeDevice(deviceHash,now+1);
    expect(db.device?.revokedAtMs).toBe(now);
  });
  it.each(["bad","", "x".repeat(65), "X".repeat(64)])(
    "rejects invalid device hashes before any SQL: %s",async hash=>{
      const db=simulatedDb();
      await expect(revokeRegisteredMobileDeviceHash(hash,now)).rejects.toThrow();
      expect(db.calls).toEqual([]);
    }
  );
});
