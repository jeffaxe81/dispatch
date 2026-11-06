import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MOBILE_DEVICE_HASH_RE, assertRegisteredMobileDevice,
  hashMobileDeviceIdentifier, validateDeviceEnrollment,
  type RegisteredMobileDevice,
} from "./mobileDeviceRegistry";

const deviceId="DEVICE_TEST_UUID_ABC_12345";
const hash=hashMobileDeviceIdentifier(deviceId);
const at=1_800_000_000_000;
const registered:RegisteredMobileDevice={
  deviceHash:hash,userId:31,organizationId:44,teamId:55,
  registeredAtMs:at,revokedAtMs:null,
};
const scope={deviceHash:hash,userId:31,organizationId:44,teamId:55,issuedAtMs:at+50};

describe("Android device enrollment gates are closed by default",()=>{
  it("hashes the device ID without persistence of the raw identifier",()=>{
    expect(hash).toMatch(MOBILE_DEVICE_HASH_RE);
    expect(hash).toBe(createHash("sha256").update(deviceId,"ascii").digest("hex"));
    expect(hashMobileDeviceIdentifier(deviceId)).toBe(hash);
    expect(hash).not.toContain(deviceId);
  });
  it("validates administrator-provisioned, initially active enrollment",()=>{
    expect(()=>validateDeviceEnrollment(registered)).not.toThrow();
    expect(()=>assertRegisteredMobileDevice(registered,scope)).not.toThrow();
  });
  it("denies missing, unknown and revoked devices",()=>{
    expect(()=>assertRegisteredMobileDevice(null,scope)).toThrow(/não cadastrado/);
    expect(()=>assertRegisteredMobileDevice(undefined,scope)).toThrow(/não cadastrado/);
    expect(()=>assertRegisteredMobileDevice({...registered,revokedAtMs:at+1},scope)).toThrow();
    expect(()=>assertRegisteredMobileDevice({...registered,revokedAtMs:0},scope)).toThrow();
  });
  it.each([
    ["userId",32],["organizationId",45],["teamId",56],
    ["deviceHash",hashMobileDeviceIdentifier("DIFFERENT_DEVICE_123456")],
  ] as const)("refuses an authenticated request crossing %s", (key,value)=>{
    expect(()=>assertRegisteredMobileDevice(registered,{...scope,[key]:value})).toThrow();
  });
  it.each([
    ["userId",32],["organizationId",45],["teamId",56],
    ["deviceHash",hashMobileDeviceIdentifier("DIFFERENT_DEVICE_123456")],
  ] as const)("refuses a stored enrollment crossing %s", (key,value)=>{
    expect(()=>assertRegisteredMobileDevice({...registered,[key]:value},scope)).toThrow();
  });
  it("denies grants issued before enrollment or with malformed timestamps",()=>{
    expect(()=>assertRegisteredMobileDevice(registered,{...scope,issuedAtMs:at-1})).toThrow();
    for(const issuedAtMs of [0,-1,1.5,Number.NaN,Infinity]){
      expect(()=>assertRegisteredMobileDevice(registered,{...scope,issuedAtMs})).toThrow();
    }
    for(const registeredAtMs of [0,-1,1.5,Number.NaN,Infinity,at+100]){
      expect(()=>assertRegisteredMobileDevice({...registered,registeredAtMs},scope)).toThrow();
    }
  });
  it.each([
    ["userId",0],["organizationId",-1],["teamId",1.5],["deviceHash","x"],
    ["registeredAtMs",0],["revokedAtMs",at+1],
  ] as const)("refuses malformed registry enrollment %s",(key,value)=>{
    expect(()=>validateDeviceEnrollment({...registered,[key]:value})).toThrow();
  });
  it.each([
    ["userId",0],["organizationId",-1],["teamId",1.5],["deviceHash","x"],
  ] as const)("refuses malformed request scope %s",(key,value)=>{
    expect(()=>assertRegisteredMobileDevice(registered,{...scope,[key]:value})).toThrow();
  });
  it.each([
    "", "a", "A".repeat(15), "A".repeat(129), "a b ".repeat(10),
    "DEVICE!INVALID!1234", "raw:device:id:123456", "ü".repeat(30),
  ])("rejects unsafe or malformed device identifiers before hashing: %s",value=>{
    expect(()=>hashMobileDeviceIdentifier(value)).toThrow(/inválido/);
  });
  it("does not permit reopening a previously revoked device by enrollment",()=>{
    expect(()=>validateDeviceEnrollment({...registered,revokedAtMs:at+200})).toThrow();
  });
  it("keeps registration validation fail-closed at unsafe numeric ID boundaries",()=>{
    for(const bad of [Number.MAX_SAFE_INTEGER+1,Number.NaN,Infinity,0,-2]){
      expect(()=>assertRegisteredMobileDevice({...registered,userId:bad},scope)).toThrow();
      expect(()=>validateDeviceEnrollment({...registered,userId:bad})).toThrow();
    }
  });
});
