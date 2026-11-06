/**
 * AXE Despacho native-auth migration smoke: CI-only MySQL 8.4.
 *
 * No routes/tokens/real logins are activated. This script exercises the
 * actual Drizzle/MySQL adapters and a separate MySQL physical connection.
 * It refuses all non-local, non-isolated, non-test databases.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { pkceS256Challenge } from "../../server/mobileAuthContract";
import { issueMobileAuthorizationCode, redeemMobileAuthorizationCode } from "../../server/mobileAuthCodes";
import { createMySqlMobileCodeStore } from "../../server/mobileCodeMySqlStore";
import { createMySqlMobileSessionStore } from "../../server/mobileSessionMySqlStore";
import {
  hashMobileDeviceIdentifier,
  type RegisteredMobileDevice,
} from "../../server/mobileDeviceRegistry";
import {
  registerApprovedMobileDevice,
  revokeRegisteredMobileDeviceHash,
} from "../../server/mobileDeviceMySqlRegistry";
import {
  issueSessionAfterCodeRedemption,
  verifyMobileSession,
} from "../../server/mobileSessionService";

function isolatedUrl(): string {
  const raw=process.env.DATABASE_URL??"";
  let parsed:URL;
  try {parsed=new URL(raw);}catch{throw Error("URL de banco de homologação inválida.");}
  if(process.env.CI!=="true" || process.env.NODE_ENV!=="test" ||
     process.env.MOBILE_AUTH_MYSQL_SMOKE!=="1" ||
     parsed.protocol!=="mysql:" ||
     !["127.0.0.1","localhost","[::1]"].includes(parsed.hostname) ||
     parsed.pathname!=="/dispatch_mobile_auth_ci" ||
     parsed.username!=="mobile_auth_ci") {
    throw Error("Recusada execução fora do banco isolado de CI.");
  }
  return raw;
}

const verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const config={
  enabled:true,
  clientId:"axe-despacho-android",
  issuer:"https://identity.axe.example",
  redirectUri:"https://app.axe.example/mobile/oauth/callback",
};
const request={
  clientId:config.clientId,
  redirectUri:config.redirectUri,
  responseType:"code" as const,
  codeChallengeMethod:"S256" as const,
  codeChallenge:pkceS256Challenge(verifier),
  state:"AbCdEfGhiJklMnoPqrStUvWxYz0123456789_ABCDEF",
};

function credentials(code:string) {
  return {code,codeVerifier:verifier,clientId:config.clientId,redirectUri:config.redirectUri};
}
function actor(deviceId:string) {
  return {
    deviceId,userId:31,organizationId:44,teamId:55,
    userActive:true,role:"agente",
    serverAuthorizesOrganization:true,serverAuthorizesTeam:true,
  };
}
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

async function assertMigration(conn:Connection) {
  for(const [table,requiredIndexes] of [
    ["mobile_registered_devices",["PRIMARY","mobile_registered_devices_user_scope_idx"]],
    ["mobile_authorization_codes",["PRIMARY","mobile_auth_codes_device_idx","mobile_auth_codes_expiry_idx"]],
    ["mobile_sessions",["PRIMARY","mobile_sessions_device_revoked_idx","mobile_sessions_expiry_idx","mobile_sessions_user_org_idx"]],
  ] as const){
    const [rows]=await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [table]
    );
    assert.equal(rows.length,1,`migration 0025 missing table ${table}`);
    const [indexes]=await conn.query<RowDataPacket[]>(
      "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [table]
    );
    const found=new Set(indexes.map(x=>String(x.INDEX_NAME)));
    for(const index of requiredIndexes)
      assert.ok(found.has(index),`missing index ${table}.${index}`);
  }
  const [columns]=await conn.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mobile_sessions'",
  );
  assert.equal(columns.find(x=>x.COLUMN_NAME==="expires_at_ms")?.DATA_TYPE,"bigint");
  assert.equal(columns.find(x=>x.COLUMN_NAME==="revoked_at_ms")?.IS_NULLABLE,"YES");
}

async function main():Promise<void> {
  const url=isolatedUrl();
  const observer=await mysql.createConnection(url);
  const locker=await mysql.createConnection(url);
  const now=Date.now();
  const firstId="CI_DEVICE_"+randomUUID().replaceAll("-","");
  const secondId="CI_DEVICE_"+randomUUID().replaceAll("-","");
  const firstHash=hashMobileDeviceIdentifier(firstId);
  const secondHash=hashMobileDeviceIdentifier(secondId);
  const hashes=[firstHash,secondHash];
  const codeStore=createMySqlMobileCodeStore();
  const sessionStore=createMySqlMobileSessionStore();
  let transactionOpen=false;
  try {
    const [identity]=await observer.query<RowDataPacket[]>("SELECT DATABASE() AS db");
    assert.equal(identity[0]?.db,"dispatch_mobile_auth_ci");
    await assertMigration(observer);

    for(const deviceHash of hashes) {
      const record:RegisteredMobileDevice={
        deviceHash,userId:31,organizationId:44,teamId:55,
        registeredAtMs:now-10_000,revokedAtMs:null,
      };
      await registerApprovedMobileDevice(record);
    }
    const first=actor(firstId);
    const second=actor(secondId);
    await assert.rejects(registerApprovedMobileDevice({
      deviceHash:firstHash,userId:31,organizationId:44,teamId:55,
      registeredAtMs:now-1,revokedAtMs:null
    }),"Unique device hash must prohibit duplicate provisioning");

    const issued=await issueMobileAuthorizationCode(codeStore,request,config,first,now);
    const [rows]=await observer.execute<RowDataPacket[]>(
      "SELECT code_hash,device_hash,consumed_at_ms FROM mobile_authorization_codes WHERE device_hash = ?",
      [firstHash]
    );
    assert.equal(rows.length,1);
    assert.match(String(rows[0].code_hash),/^[0-9a-f]{64}$/);
    assert.equal(String(rows[0].code_hash).includes(issued.code),false);
    assert.equal(String(rows[0].device_hash),firstHash);
    const used=await redeemMobileAuthorizationCode(codeStore,credentials(issued.code),first,now+100);
    assert.equal(used.userId,first.userId);
    await assert.rejects(redeemMobileAuthorizationCode(codeStore,credentials(issued.code),first,now+101));

    // Promise contention uses the real MySQL code adapter and shared pool.
    const concurrent=await issueMobileAuthorizationCode(codeStore,request,config,first,now+200);
    const attempts=await Promise.allSettled(Array.from({length:12},()=>
      redeemMobileAuthorizationCode(codeStore,credentials(concurrent.code),first,now+201)
    ));
    assert.equal(attempts.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(attempts.filter(x=>x.status==="rejected").length,11);

    // A code can create ONE short-lived session, observed via another socket.
    const sessionGrant=await issueMobileAuthorizationCode(codeStore,request,config,first,now+300);
    const native=await issueSessionAfterCodeRedemption(
      codeStore,sessionStore,credentials(sessionGrant.code),first,now+301
    );
    const verified=await verifyMobileSession(sessionStore,native.handle,first,now+350);
    assert.equal(verified.organizationId,44);
    assert.equal(verified.teamId,55);
    const [sessionRecords]=await observer.execute<RowDataPacket[]>(
      "SELECT session_hash,device_hash FROM mobile_sessions WHERE device_hash = ?",[firstHash]
    );
    assert.equal(sessionRecords.length,1);
    assert.match(String(sessionRecords[0].session_hash),/^[0-9a-f]{64}$/);
    assert.notEqual(sessionRecords[0].session_hash,native.handle);
    await assert.rejects(verifyMobileSession(sessionStore,native.handle,{...first,teamId:999},now+350));
    await assert.rejects(verifyMobileSession(sessionStore,native.handle,first,native.expiresAtMs));

    // Revocation invalidates both already issued grants and future issuance.
    const pendingSecond=await issueMobileAuthorizationCode(codeStore,request,config,second,now+400);
    const existingSecond=await issueMobileAuthorizationCode(codeStore,request,config,second,now+401);
    const secondSession=await issueSessionAfterCodeRedemption(
      codeStore,sessionStore,credentials(existingSecond.code),second,now+402
    );
    await revokeRegisteredMobileDeviceHash(secondHash,now+500);
    const [blockedDevices]=await observer.execute<RowDataPacket[]>(
      "SELECT revoked_at_ms FROM mobile_registered_devices WHERE device_hash=?",[secondHash]
    );
    assert.equal(Number(blockedDevices[0]?.revoked_at_ms),now+500);
    const [blockedCodes]=await observer.execute<RowDataPacket[]>(
      "SELECT revoked_at_ms FROM mobile_authorization_codes WHERE device_hash=? AND consumed_at_ms IS NULL",[secondHash]
    );
    assert.ok(blockedCodes.length>=1);
    assert.ok(blockedCodes.every(x=>x.revoked_at_ms!==null));
    const [blockedSessions]=await observer.execute<RowDataPacket[]>(
      "SELECT revoked_at_ms FROM mobile_sessions WHERE device_hash=?",[secondHash]
    );
    assert.equal(blockedSessions.length,1);
    assert.equal(Number(blockedSessions[0].revoked_at_ms),now+500);
    await assert.rejects(redeemMobileAuthorizationCode(
      codeStore,credentials(pendingSecond.code),second,now+600
    ));
    await assert.rejects(verifyMobileSession(sessionStore,secondSession.handle,second,now+600));
    await assert.rejects(issueMobileAuthorizationCode(codeStore,request,config,second,now+600));
    await revokeRegisteredMobileDeviceHash(secondHash,now+700); // idempotent, preserves original time
    const [blockedTwice]=await observer.execute<RowDataPacket[]>(
      "SELECT revoked_at_ms FROM mobile_registered_devices WHERE device_hash=?",[secondHash]
    );
    assert.equal(Number(blockedTwice[0].revoked_at_ms),now+500);

    // Critical two-physical-connection race: the first connection revokes
    // registration while a second backend transaction is trying to issue.
    // Acquiring a row lock after that commit MUST observe revoked status.
    await locker.beginTransaction();
    transactionOpen=true;
    const [locked]=await locker.execute<RowDataPacket[]>(
      "SELECT device_hash FROM mobile_registered_devices WHERE device_hash=? FOR UPDATE",[firstHash]
    );
    assert.equal(locked.length,1);
    await locker.execute<ResultSetHeader>(
      "UPDATE mobile_registered_devices SET revoked_at_ms=? WHERE device_hash=?",[now+800,firstHash]
    );
    let done=false;
    const waiting=issueMobileAuthorizationCode(
      codeStore,request,config,first,now+801
    ).then(
      ()=>{done=true;return "issued" as const;},
      ()=>{done=true;return "denied" as const;}
    );
    await sleep(180);
    assert.equal(done,false,"issue must wait while physical MySQL device row is locked");
    await locker.commit();
    transactionOpen=false;
    assert.equal(await waiting,"denied","issued grants must be refused after revoked lock commits");
    await revokeRegisteredMobileDeviceHash(firstHash,now+802);
    await assert.rejects(verifyMobileSession(sessionStore,native.handle,first,now+803));
    const [firstSessions]=await observer.execute<RowDataPacket[]>(
      "SELECT revoked_at_ms FROM mobile_sessions WHERE device_hash=?",[firstHash]
    );
    assert.equal(Number(firstSessions[0]?.revoked_at_ms),now+800);

    // A known, revoked device remains blocked even after attempted re-enroll.
    await assert.rejects(registerApprovedMobileDevice({
      deviceHash:firstHash,userId:31,organizationId:44,teamId:55,
      registeredAtMs:now+900,revokedAtMs:null
    }));
    process.stdout.write("PASS: MySQL 8.4 migration 0025; PKCE single-use; multi-connection lock; session and device revocation.\\n");
  } finally {
    if(transactionOpen)await locker.rollback().catch(()=>{});
    // All mutation is confined to the per-run throwaway CI database.
    for(const hash of hashes){
      await observer.execute("DELETE FROM mobile_sessions WHERE device_hash=?",[hash]).catch(()=>{});
      await observer.execute("DELETE FROM mobile_authorization_codes WHERE device_hash=?",[hash]).catch(()=>{});
      await observer.execute("DELETE FROM mobile_registered_devices WHERE device_hash=?",[hash]).catch(()=>{});
    }
    await locker.end().catch(()=>{});
    await observer.end().catch(()=>{});
  }
}

void main().catch(error=>{
  // Never include grant codes, session handles or raw device IDs in logs.
  process.stderr.write("Mobile auth CI MySQL smoke failed: "+
    (error instanceof Error?error.name:"UnknownError")+"\\n");
  process.exitCode=1;
});
