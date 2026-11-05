import { describe, expect, it } from "vitest";
import {
  pkceS256Challenge, verifyPkceS256,
  validateMobileAuthorizationRequest, validateMobileCallback,
  validateNativeSessionScope,
  type MobileAuthorizationConfiguration,
  type MobileAuthorizationRequest,
  type NativeSessionBinding,
  type NativeAccessRequest,
} from "./mobileAuthContract";

const config: MobileAuthorizationConfiguration = {
  enabled: true,
  clientId: "axe-despacho-android",
  issuer: "https://identity.axe.example",
  redirectUri: "https://app.axe.example/mobile/oauth/callback",
};
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "Y3VzdG9tLXJlbGF0aW9uLWJpbmRpbmctc3RhdGUxMjM0NTY3ODkw";
const code = "CodiFicacaoTesteSegura123456789ABCDEFG";
const request: MobileAuthorizationRequest = {
  clientId: config.clientId,
  redirectUri: config.redirectUri,
  responseType: "code",
  codeChallengeMethod: "S256",
  codeChallenge: challenge,
  state,
};

function callback(extra:Record<string,string>={}):string {
  const url = new URL(config.redirectUri);
  url.searchParams.set("code", extra.code ?? code);
  url.searchParams.set("state", extra.state ?? state);
  url.searchParams.set("iss", extra.iss ?? config.issuer);
  return url.toString();
}

describe("Android native auth contract, disabled until secure backend integration",()=>{
  it("computes the RFC 7636 published S256 vector",()=>{
    expect(pkceS256Challenge(verifier)).toBe(challenge);
    expect(verifyPkceS256(verifier,challenge)).toBe(true);
    expect(verifyPkceS256(verifier,challenge.slice(0,-1)+"x")).toBe(false);
  });
  it.each(["short", "", "?", "x".repeat(129), " " .repeat(43)])(
    "rejects invalid code verifiers: %s",bad=>{
      expect(()=>pkceS256Challenge(bad)).toThrow(/não autorizado/);
      expect(verifyPkceS256(bad,challenge)).toBe(false);
    });
  it("prevents algorithm downgrade to PKCE plain",()=>{
    expect(()=>validateMobileAuthorizationRequest({...request,codeChallengeMethod:"plain" as "S256"},config)).toThrow();
  });
  it("denies all native authorization by default without an explicit registered configuration",()=>{
    expect(()=>validateMobileAuthorizationRequest(request,{...config,enabled:false})).toThrow();
  });
  it("accepts only exact registered client and verified HTTPS App Link redirect",()=>{
    expect(()=>validateMobileAuthorizationRequest(request,config)).not.toThrow();
    expect(()=>validateMobileAuthorizationRequest({...request,clientId:"other-app"},config)).toThrow();
    expect(()=>validateMobileAuthorizationRequest({...request,redirectUri:"https://evil.example/mobile/oauth/callback"},config)).toThrow();
  });
  it.each([
    "http://app.axe.example/mobile/oauth/callback",
    "https://localhost/mobile/oauth/callback",
    "https://127.0.0.1/mobile/oauth/callback",
    "https://[::1]/mobile/oauth/callback",
    "https://app.axe.example:8443/mobile/oauth/callback",
    "https://user:secret@app.axe.example/mobile/oauth/callback",
    "https://app.axe.example/mobile/oauth/callback?x=1",
    "https://app.axe.example/mobile/oauth/callback#state",
    "https://app.axe.example/",
    "capacit​or://localhost/callback",
    "axe-despacho://callback",
  ])("rejects unsafe/unverified redirect: %s",redirectUri=>{
    expect(()=>validateMobileAuthorizationRequest({...request,redirectUri},{
      ...config,redirectUri
    })).toThrow();
  });
  it.each([
    "http://identity.axe.example",
    "https://localhost",
    "https://identity.axe.example:8443",
    "https://identity.axe.example/path",
    "https://identity.axe.example/?token=1",
    "https://user:secret@identity.axe.example",
  ])("rejects an insecure issuer origin: %s",issuer=>{
    expect(()=>validateMobileAuthorizationRequest(request,{...config,issuer})).toThrow();
  });
  it("requires long random state and PKCE challenge syntax",()=>{
    expect(()=>validateMobileAuthorizationRequest({...request,state:"predictable"},config)).toThrow();
    expect(()=>validateMobileAuthorizationRequest({...request,codeChallenge:"abc"},config)).toThrow();
    expect(()=>validateMobileAuthorizationRequest({...request,responseType:"token" as "code"},config)).toThrow();
  });
  it("matches full callback code, state and RFC9207 issuer",()=>{
    expect(validateMobileCallback(callback(),{redirectUri:config.redirectUri,state,issuer:config.issuer})).toBe(code);
  });
  it.each([
    "https://evil.example/mobile/oauth/callback",
    "http://app.axe.example/mobile/oauth/callback",
    "https://app.axe.example/other",
    "https://user:secret@app.axe.example/mobile/oauth/callback",
  ])("rejects callback wrong origin/path/credentials: %s",prefix=>{
    const url = new URL(callback());
    const candidate=new URL(prefix);
    candidate.search=url.search;
    expect(()=>validateMobileCallback(candidate.toString(),{
      redirectUri:config.redirectUri,state,issuer:config.issuer
    })).toThrow();
  });
  it("refuses callbacks carrying a fragment, missing issuer or duplicate state",()=>{
    expect(()=>validateMobileCallback(callback()+"#x",{redirectUri:config.redirectUri,state,issuer:config.issuer})).toThrow();
    const missing=new URL(callback());
    missing.searchParams.delete("iss");
    expect(()=>validateMobileCallback(missing.href,{redirectUri:config.redirectUri,state,issuer:config.issuer})).toThrow();
    const duplicate=new URL(callback());
    duplicate.searchParams.append("state",state);
    expect(()=>validateMobileCallback(duplicate.href,{redirectUri:config.redirectUri,state,issuer:config.issuer})).toThrow();
  });
  it("refuses mix-up, CSRF state mismatch or a callback error",()=>{
    for(const value of [
      callback({state:"A".repeat(43)}),
      callback({iss:"https://evil.example"}),
      callback({code:"x"}),
      callback()+"&error=access_denied",
    ]){
      expect(()=>validateMobileCallback(value,{redirectUri:config.redirectUri,state,issuer:config.issuer})).toThrow();
    }
  });
});

const issuedAtMs=1_000_000;
const binding:NativeSessionBinding={
  userId:11,organizationId:22,teamId:33,
  deviceId:"DEVICE_TEST_UUID_ABC_12345",
  issuedAtMs,
  expiresAtMs:issuedAtMs+600_000,
};
const principal:NativeAccessRequest={
  userId:11,organizationId:22,teamId:33,
  deviceId:binding.deviceId,
  userActive:true,role:"agente",
  serverAuthorizesOrganization:true,serverAuthorizesTeam:true,
};
const now=issuedAtMs+10_000;

describe("native per-request tenant/team/device scope validation (not yet wired)",()=>{
  it("allows matching active authorized agent scope before expiry",()=>{
    expect(()=>validateNativeSessionScope(binding,principal,now)).not.toThrow();
  });
  it.each([
    ["userId",99],["organizationId",99],["teamId",99],
    ["deviceId","DIFFERENT_DEVICE_123456"]
  ] as const)("rejects cross-session request %s",(key,value)=>{
    expect(()=>validateNativeSessionScope(binding,{...principal,[key]:value},now)).toThrow();
  });
  it.each([
    ["userActive",false],["role","administrador"],
    ["serverAuthorizesOrganization",false],["serverAuthorizesTeam",false],
  ] as const)("requires live DB-backed permission: %s",(key,value)=>{
    expect(()=>validateNativeSessionScope(binding,{...principal,[key]:value},now)).toThrow();
  });
  it.each([
    ["userId",0],["organizationId",-1],["teamId",1.5],["deviceId","x"],
    ["expiresAtMs",issuedAtMs],["issuedAtMs",-1]
  ] as const)("denies invalid token claim %s",(key,value)=>{
    expect(()=>validateNativeSessionScope({...binding,[key]:value},principal,now)).toThrow();
  });
  it("rejects expired, not yet valid and unrealistically long tokens",()=>{
    expect(()=>validateNativeSessionScope(binding,principal,binding.expiresAtMs)).toThrow();
    expect(()=>validateNativeSessionScope(binding,principal,issuedAtMs-1)).toThrow();
    expect(()=>validateNativeSessionScope({...binding,expiresAtMs:issuedAtMs+16*60_000},principal,now)).toThrow();
  });
  it("does not treat NaN, Infinity or fractional time as trusted",()=>{
    for(const value of [Number.NaN,Infinity,-Infinity,1.5,-1]){
      expect(()=>validateNativeSessionScope(binding,principal,value)).toThrow();
    }
  });
});
