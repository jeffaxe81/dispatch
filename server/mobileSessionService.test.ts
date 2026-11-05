import { describe, expect, it, vi } from "vitest";
import { pkceS256Challenge } from "./mobileAuthContract";
import {
  issueMobileAuthorizationCode, type MobileCodeRecord, type MobileCodeStore,
} from "./mobileAuthCodes";
import {
  MOBILE_SESSION_TTL_MS, issueSessionAfterCodeRedemption, verifyMobileSession,
  revokeMobileSession, revokeMobileDeviceSessions,
  type MobileSessionRow, type MobileSessionStore,
} from "./mobileSessionService";

const now=1_800_000_000_000;
const deviceId="DEVICE_TEST_UUID_ABC_12345";
const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const config={
  enabled:true,clientId:"axe-despacho-android",
  issuer:"https://identity.axe.example",
  redirectUri:"https://app.axe.example/mobile/oauth/callback",
};
const authRequest={
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

function stores() {
  const codeRows=new Map<string,MobileCodeRecord>();
  const sessionRows=new Map<string,MobileSessionRow>();
  const codes:MobileCodeStore={
    async put(row){
      if(codeRows.has(row.codeHash))throw Error("duplicate code");
      codeRows.set(row.codeHash,{...row});
    },
    async take(hash,time){
      const row=codeRows.get(hash);
      if(!row || row.consumedAtMs!==null || row.revokedAtMs!==null ||
         row.expiresAtMs<=time || row.issuedAtMs>time)return null;
      const spent={...row,consumedAtMs:time};
      codeRows.set(hash,spent);
      return spent;
    },
    async revokeDevice(hash,time){
      for(const [key,row] of codeRows){
        if(row.deviceHash===hash && row.revokedAtMs===null &&
           row.consumedAtMs===null)codeRows.set(key,{...row,revokedAtMs:time});
      }
    },
  };
  const sessions:MobileSessionStore={
    async create(row){
      if(sessionRows.has(row.sessionHash))throw Error("duplicate session");
      sessionRows.set(row.sessionHash,{...row});
    },
    async readActive(hash,time){
      const row=sessionRows.get(hash);
      return row && row.revokedAtMs===null && row.expiresAtMs>time ? {...row}:null;
    },
    async revokeSession(hash,time){
      const row=sessionRows.get(hash);
      if(row && row.revokedAtMs===null)sessionRows.set(hash,{...row,revokedAtMs:time});
    },
    async revokeDevice(hash,time){
      for(const [key,row] of sessionRows){
        if(row.deviceHash===hash && row.revokedAtMs===null)
          sessionRows.set(key,{...row,revokedAtMs:time});
      }
    },
  };
  return {codes,sessions,codeRows,sessionRows};
}

async function issued(env=stores(),identity=actor,time=now) {
  const {code}=await issueMobileAuthorizationCode(env.codes,authRequest,config,identity,time);
  return {
    ...env,
    code,
    input:{code,codeVerifier:verifier,clientId:config.clientId,redirectUri:config.redirectUri},
  };
}
async function activeSession(env=stores(),identity=actor,time=now) {
  const grant=await issued(env,identity,time);
  const session=await issueSessionAfterCodeRedemption(grant.codes,grant.sessions,
    grant.input,identity,time+100);
  return {...grant,...session};
}

describe("dormant durable Android mobile sessions (no routes enabled)",()=>{
  it("creates a 256-bit random handle but persists only SHA-256 hashes",async()=>{
    const env=await activeSession();
    expect(env.handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const record=[...env.sessionRows.values()][0];
    expect(record.sessionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.deviceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.sessionHash).not.toBe(env.handle);
    expect(record.deviceHash).not.toBe(deviceId);
    expect(env.expiresAtMs).toBe(now+100+MOBILE_SESSION_TTL_MS);
    expect(JSON.stringify(record)).not.toContain(env.handle);
  });
  it("revalidates the same tenant, team, device and identity at each read",async()=>{
    const env=await activeSession();
    const binding=await verifyMobileSession(env.sessions,env.handle,actor,now+200);
    expect(binding).toMatchObject({
      userId:31,organizationId:44,teamId:55,deviceId,
    });
    expect(JSON.stringify(binding)).not.toMatch(/accessToken|refreshToken|password/i);
  });
  it.each([
    ["userId",99],["organizationId",99],["teamId",99],
    ["deviceId","OTHER_DEVICE_UUID_ABC_12345"],
    ["role","administrador"],["userActive",false],
    ["serverAuthorizesOrganization",false],["serverAuthorizesTeam",false],
  ] as const)("blocks a live authorization mismatch: %s",async(key,value)=>{
    const env=await activeSession();
    await expect(verifyMobileSession(env.sessions,env.handle,
      {...actor,[key]:value},now+300)).rejects.toThrow();
  });
  it("revokes an individual session and never recreates it on later access",async()=>{
    const env=await activeSession();
    await revokeMobileSession(env.sessions,env.handle,now+500);
    await expect(verifyMobileSession(env.sessions,env.handle,actor,now+501)).rejects.toThrow();
    await revokeMobileSession(env.sessions,env.handle,now+502);
    expect([...env.sessionRows.values()][0].revokedAtMs).toBe(now+500);
  });
  it("revokes all existing sessions for one device without impacting other devices",async()=>{
    const env=stores();
    const a=await activeSession(env,actor);
    const b=await activeSession(env,actor);
    const other={...actor,deviceId:"OTHER_DEVICE_UUID_ABC_12345"};
    const c=await activeSession(env,other);
    await revokeMobileDeviceSessions(env.sessions,deviceId,now+300);
    for(const handle of [a.handle,b.handle]){
      await expect(verifyMobileSession(env.sessions,handle,actor,now+400)).rejects.toThrow();
    }
    await expect(verifyMobileSession(env.sessions,c.handle,other,now+400)).resolves.toMatchObject({
      userId:31,deviceId:other.deviceId,
    });
  });
  it("expires at the exact 15-minute boundary with no grace",async()=>{
    const env=await activeSession();
    await expect(verifyMobileSession(env.sessions,env.handle,actor,env.expiresAtMs-1))
      .resolves.toMatchObject({teamId:55});
    await expect(verifyMobileSession(env.sessions,env.handle,actor,env.expiresAtMs))
      .rejects.toThrow();
  });
  it("cannot be used before its issued-at time",async()=>{
    const env=await activeSession();
    await expect(verifyMobileSession(env.sessions,env.handle,actor,now+99)).rejects.toThrow();
  });
  it("refuses replay of a redeemed code and does not create a second session",async()=>{
    const env=await issued();
    await issueSessionAfterCodeRedemption(env.codes,env.sessions,env.input,actor,now+100);
    await expect(issueSessionAfterCodeRedemption(env.codes,env.sessions,env.input,actor,now+101))
      .rejects.toThrow();
    expect(env.sessionRows.size).toBe(1);
  });
  it("allows only one session when a single code is redeemed in parallel",async()=>{
    const env=await issued();
    const attempts=await Promise.allSettled(Array.from({length:20},()=>issueSessionAfterCodeRedemption(
      env.codes,env.sessions,env.input,actor,now+100
    )));
    expect(attempts.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect(attempts.filter(x=>x.status==="rejected")).toHaveLength(19);
    expect(env.sessionRows.size).toBe(1);
  });
  it("consumes the code even if the session store fails, requiring a fresh authorization",async()=>{
    const env=await issued();
    const fail:MobileSessionStore={
      ...env.sessions,create:async()=>{throw Error("MySQL write failure");}
    };
    await expect(issueSessionAfterCodeRedemption(env.codes,fail,env.input,actor,now+100))
      .rejects.toThrow("MySQL write failure");
    await expect(issueSessionAfterCodeRedemption(env.codes,env.sessions,env.input,actor,now+101))
      .rejects.toThrow();
    expect(env.sessionRows.size).toBe(0);
  });
  it("fails closed when session lookup cannot reach MySQL",async()=>{
    const env=await activeSession();
    const broken:MobileSessionStore={
      ...env.sessions,readActive:async()=>{throw Error("MySQL unavailable");},
    };
    await expect(verifyMobileSession(broken,env.handle,actor,now+200))
      .rejects.toThrow("MySQL unavailable");
  });
  it("fails closed on malformed handles without touching the repository",async()=>{
    const env=stores();
    const reader=vi.spyOn(env.sessions,"readActive");
    for(const handle of ["", "short", "A".repeat(44), "A".repeat(42)+"!"]){
      await expect(verifyMobileSession(env.sessions,handle,actor,now)).rejects.toThrow();
    }
    expect(reader).not.toHaveBeenCalled();
  });
  it("rejects malformed device identifiers before querying MySQL",async()=>{
    const env=await activeSession();
    const reader=vi.spyOn(env.sessions,"readActive");
    await expect(verifyMobileSession(env.sessions,env.handle,
      {...actor,deviceId:"bad"},now+100)).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
  });
  it.each([0,-1,1.5,Number.NaN,Infinity,Number.MAX_SAFE_INTEGER])(
    "rejects invalid clocks and overflow: %s",async(time)=>{
      const env=stores();
      await expect(revokeMobileDeviceSessions(env.sessions,deviceId,time)).rejects.toThrow();
      await expect(revokeMobileSession(env.sessions,"a".repeat(43),time)).rejects.toThrow();
      await expect(verifyMobileSession(env.sessions,"a".repeat(43),actor,time))
        .rejects.toThrow();
    }
  );
  it("rejects a stale role or tenant when exchanging the one-time code",async()=>{
    const env=await issued();
    await expect(issueSessionAfterCodeRedemption(env.codes,env.sessions,env.input,
      {...actor,organizationId:999},now+100)).rejects.toThrow();
    expect(env.sessionRows.size).toBe(0);
  });
  it("does not accept a forged or prolonged session row",async()=>{
    const env=await activeSession();
    const old=env.sessions.readActive;
    const fake:MobileSessionStore={
      ...env.sessions,
      readActive:async(hash,time)=>{
        const row=await old(hash,time);
        return row?{...row,expiresAtMs:row.expiresAtMs+1}:null;
      },
    };
    await expect(verifyMobileSession(fake,env.handle,actor,now+200)).rejects.toThrow();
  });
  it("revocation is durable: already-issued handles remain denied after client relaunch",async()=>{
    const env=await activeSession();
    const handle=env.handle;
    await revokeMobileDeviceSessions(env.sessions,deviceId,now+900);
    await expect(verifyMobileSession(env.sessions,handle,actor,now+1000)).rejects.toThrow();
  });
});
