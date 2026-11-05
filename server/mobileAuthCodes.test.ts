import { describe, expect, it, vi } from "vitest";
import {
  MOBILE_AUTH_CODE_TTL_MS,
  issueMobileAuthorizationCode,
  redeemMobileAuthorizationCode,
  revokePendingMobileCodesForDevice,
  type MobileCodeRecord,
  type MobileCodeStore,
} from "./mobileAuthCodes";
import { pkceS256Challenge } from "./mobileAuthContract";

const at=1_800_000_000_000;
const deviceId="DEVICE_TEST_UUID_ABC_12345";
const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const config={
  enabled:true,
  clientId:"axe-despacho-android",
  issuer:"https://identity.axe.example",
  redirectUri:"https://app.axe.example/mobile/oauth/callback",
};
const request={
  clientId:config.clientId,redirectUri:config.redirectUri,
  responseType:"code" as const,codeChallengeMethod:"S256" as const,
  codeChallenge:pkceS256Challenge(verifier),
  state:"AbCdEfGhiJklMnoPqrStUvWxYz0123456789_ABCDEF",
};
const actor={
  userId:31,organizationId:44,teamId:55,deviceId,
  userActive:true,role:"agente",
  serverAuthorizesOrganization:true,serverAuthorizesTeam:true,
};

function memoryStore():MobileCodeStore & {records:Map<string,MobileCodeRecord>} {
  const records=new Map<string,MobileCodeRecord>();
  return {
    records,
    async put(record) {
      if(records.has(record.codeHash))throw Error("Unique code hash violation");
      records.set(record.codeHash,{...record});
    },
    async take(hash,now) {
      // Mimics one atomic MySQL transaction, not two separate async reads.
      const row=records.get(hash);
      if(!row || row.consumedAtMs!==null || row.revokedAtMs!==null ||
         row.expiresAtMs<=now || row.issuedAtMs>now)return null;
      const consumed={...row,consumedAtMs:now};
      records.set(hash,consumed);
      return consumed;
    },
    async revokeDevice(hash,now) {
      for(const [code,row] of records){
        if(row.deviceHash===hash && row.consumedAtMs===null && row.revokedAtMs===null){
          records.set(code,{...row,revokedAtMs:now});
        }
      }
    }
  };
}
function redeemInput(code:string) {
  return {code,codeVerifier:verifier,clientId:config.clientId,redirectUri:config.redirectUri};
}

describe("durable mobile authorization-code protocol (not wired to routes)",()=>{
  it("stores only a SHA-256 code hash, not a plaintext authorization code",async()=>{
    const store=memoryStore();
    const issued=await issueMobileAuthorizationCode(store,request,config,actor,at);
    expect(issued.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAtMs).toBe(at+MOBILE_AUTH_CODE_TTL_MS);
    const stored=[...store.records.values()][0];
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.codeHash).not.toContain(issued.code);
    expect(stored.deviceHash).not.toBe(deviceId);
    expect(stored.consumedAtMs).toBeNull();
    expect(stored.revokedAtMs).toBeNull();
  });
  it("returns a short-lived candidate binding and never an operational token",async()=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    const binding=await redeemMobileAuthorizationCode(store,redeemInput(code),actor,at+500);
    expect(binding).toEqual({
      userId:31,organizationId:44,teamId:55,deviceId,
      issuedAtMs:at+500,expiresAtMs:at+500+15*60_000
    });
    expect(JSON.stringify(binding)).not.toMatch(/accessToken|refreshToken|jwt|password/);
  });
  it("permits exactly one successful redemption across concurrent attempts",async()=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    const outcomes=await Promise.allSettled(Array.from({length:20},()=>
      redeemMobileAuthorizationCode(store,redeemInput(code),actor,at+300)));
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r=>r.status==="rejected")).toHaveLength(19);
    expect([...store.records.values()][0].consumedAtMs).toBe(at+300);
  });
  it("consumes a guessed/failed verifier once, with no second chance",async()=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    await expect(redeemMobileAuthorizationCode(store,{
      ...redeemInput(code),codeVerifier:"x".repeat(43)
    },actor,at+1)).rejects.toThrow();
    await expect(redeemMobileAuthorizationCode(store,redeemInput(code),actor,at+2)).rejects.toThrow();
  });
  it("revokes all pending codes for a device without altering other devices",async()=>{
    const store=memoryStore();
    const other={...actor,deviceId:"OTHER_DEVICE_UUID_ABC_12345"};
    const first=await issueMobileAuthorizationCode(store,request,config,actor,at);
    const second=await issueMobileAuthorizationCode(store,request,config,actor,at);
    const keep=await issueMobileAuthorizationCode(store,request,config,other,at);
    await revokePendingMobileCodesForDevice(store,deviceId,at+1);
    await expect(redeemMobileAuthorizationCode(store,redeemInput(first.code),actor,at+2)).rejects.toThrow();
    await expect(redeemMobileAuthorizationCode(store,redeemInput(second.code),actor,at+2)).rejects.toThrow();
    await expect(redeemMobileAuthorizationCode(store,redeemInput(keep.code),other,at+2)).resolves.toMatchObject({deviceId:other.deviceId});
  });
  it("fails closed on disabled native authorization",async()=>{
    const store=memoryStore();
    await expect(issueMobileAuthorizationCode(store,request,{...config,enabled:false},actor,at)).rejects.toThrow();
    expect(store.records.size).toBe(0);
  });
  it("rejects issuing codes to inactive agents or unverified team/organization",async()=>{
    for(const override of [
      {userActive:false},{role:"administrador"},
      {serverAuthorizesTeam:false},{serverAuthorizesOrganization:false},
      {teamId:0},{organizationId:0},{deviceId:"bad"},
    ]){
      const store=memoryStore();
      await expect(issueMobileAuthorizationCode(store,request,config,{...actor,...override},at)).rejects.toThrow();
      expect(store.records.size).toBe(0);
    }
  });
  it("expires codes after two minutes and rejects clock rollback",async()=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    await expect(redeemMobileAuthorizationCode(store,redeemInput(code),actor,at-1)).rejects.toThrow();
    await expect(redeemMobileAuthorizationCode(store,redeemInput(code),actor,at+MOBILE_AUTH_CODE_TTL_MS)).rejects.toThrow();
  });
  it.each([
    ["userId",99],["organizationId",99],["teamId",99],
    ["deviceId","DIFFERENT_DEVICE_123456"],["role","administrador"],
    ["userActive",false],["serverAuthorizesTeam",false],["serverAuthorizesOrganization",false],
  ] as const)("rejects live authorization divergence %s at redemption",async(key,value)=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    await expect(redeemMobileAuthorizationCode(store,redeemInput(code),{
      ...actor,[key]:value
    },at+20)).rejects.toThrow();
  });
  it.each([
    ["clientId","different-client"],
    ["redirectUri","https://evil.example/mobile/oauth/callback"],
    ["codeVerifier","bad"],
    ["codeVerifier","x".repeat(43)],
  ] as const)("rejects mismatched exchange parameter %s",async(key,value)=>{
    const store=memoryStore();
    const {code}=await issueMobileAuthorizationCode(store,request,config,actor,at);
    await expect(redeemMobileAuthorizationCode(store,{
      ...redeemInput(code),[key]:value
    },actor,at+10)).rejects.toThrow();
  });
  it.each([0,-1,Number.NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER])(
    "rejects invalid issued-at clocks: %s",async now=>{
      await expect(issueMobileAuthorizationCode(memoryStore(),request,config,actor,now)).rejects.toThrow();
    }
  );
  it("rejects malformed code before calling the transactional store",async()=>{
    const store=memoryStore();
    const take=vi.spyOn(store,"take");
    await expect(redeemMobileAuthorizationCode(store,redeemInput("INVALID"),actor,at)).rejects.toThrow();
    expect(take).not.toHaveBeenCalled();
  });
  it("never treats a storage outage as a successful issue or exchange",async()=>{
    const unavailable:MobileCodeStore={
      put:async()=>{throw Error("MySQL unavailable");},
      take:async()=>{throw Error("MySQL unavailable");},
      revokeDevice:async()=>{throw Error("MySQL unavailable");}
    };
    await expect(issueMobileAuthorizationCode(unavailable,request,config,actor,at)).rejects.toThrow(/MySQL/);
    await expect(redeemMobileAuthorizationCode(unavailable,redeemInput("A".repeat(43)),actor,at)).rejects.toThrow(/MySQL/);
    await expect(revokePendingMobileCodesForDevice(unavailable,deviceId,at)).rejects.toThrow(/MySQL/);
  });
});
