import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInventoryHomologationConfig, inventoryPreflightFromEnv, HOMOLOGATION_EXECUTION_PHRASE } from "./inventory-external-preflight.mjs";

const valid = () => ({
  executionApproval: HOMOLOGATION_EXECUTION_PHRASE,
  allowedHosts: "assets.hml.example.org, dispatch.hml.example.org",
  assetMotorBaseUrl: "https://assets.hml.example.org",
  dispatchBaseUrl: "https://dispatch.hml.example.org",
  tenantA: "tenant-a",
  tenantB: "tenant-b",
  userId: "operator-fixture",
  incidentReference: "occurrence-fixture",
  authToken: "synthetic-no-access",
  timeoutMs: 3000,
});
const denied = (obj, code) => assert.throws(() => validateInventoryHomologationConfig(obj), { message: "INVENTORY_PREFLIGHT_" + code });

test("requires explicit per-run confirmation", () => {
  denied({...valid(),executionApproval:""}, "EXPLICIT_APPROVAL_MISSING");
  denied({...valid(),executionApproval:"yes"}, "EXPLICIT_APPROVAL_MISSING");
});
test("accepts only exact allowlisted HTTPS hostnames", () => {
  assert.deepEqual(validateInventoryHomologationConfig(valid()), { approved: true, targetCount: 2 });
  denied({...valid(),assetMotorBaseUrl:"http://assets.hml.example.org"}, "ENDPOINT_INVALID");
  denied({...valid(),assetMotorBaseUrl:"https://assets.hml.example.org:8443"}, "ENDPOINT_INVALID");
  denied({...valid(),assetMotorBaseUrl:"https://assets.hml.example.org.evil.test"}, "ENDPOINT_NOT_ALLOWLISTED");
  denied({...valid(),assetMotorBaseUrl:"https://assets.hml.example.org?token=unsafe"}, "ENDPOINT_INVALID");
  denied({...valid(),assetMotorBaseUrl:"https://u:p@assets.hml.example.org"}, "ENDPOINT_INVALID");
  denied({...valid(),dispatchBaseUrl:"https://127.0.0.1"}, "ENDPOINT_INVALID");
  denied({...valid(),dispatchBaseUrl:"https://localhost"}, "ENDPOINT_INVALID");
  denied({...valid(),allowedHosts:""}, "HOST_ALLOWLIST_MISSING");
  denied({...valid(),allowedHosts:"dispatch.hml.example.org"}, "ENDPOINT_NOT_ALLOWLISTED");
  denied({...valid(),allowedHosts:"assets.hml.example.org,localhost"}, "HOST_ALLOWLIST_INVALID");
});
test("enforces distinct tenant scopes and required scoped authentication", () => {
  denied({...valid(),tenantB:"tenant-a"}, "TENANTS_NOT_DISTINCT");
  denied({...valid(),authToken:""}, "AUTH_TOKEN_MISSING");
  denied({...valid(),userId:""}, "USER_MISSING");
  denied({...valid(),incidentReference:""}, "INCIDENT_MISSING");
});
test("restricts timeout without showing sensitive configuration", () => {
  denied({...valid(),timeoutMs:0}, "TIMEOUT_INVALID");
  denied({...valid(),timeoutMs:Infinity}, "TIMEOUT_INVALID");
  denied({...valid(),timeoutMs:30001}, "TIMEOUT_INVALID");
  const cfg=valid();
  cfg.allowedHosts="secret-host.invalid";
  try {
    validateInventoryHomologationConfig(cfg);
    assert.fail("Must be denied");
  } catch (e) {
    assert.equal(e.message, "INVENTORY_PREFLIGHT_ENDPOINT_NOT_ALLOWLISTED");
    assert.ok(!e.message.includes("secret-host"));
    assert.ok(!e.message.includes(cfg.authToken));
  }
});
test("env adapter checks the same strict contract without network", () => {
  const v=valid();
  assert.deepEqual(inventoryPreflightFromEnv({
    HOMOLOGATION_EXECUTION_APPROVAL:v.executionApproval,
    HOMOLOGATION_ALLOWED_HOSTS:v.allowedHosts,
    ASSET_MOTOR_BASE_URL:v.assetMotorBaseUrl,
    DISPATCH_BASE_URL:v.dispatchBaseUrl,
    TENANT_A:v.tenantA,TENANT_B:v.tenantB,
    HOMOLOGATION_USER_ID:v.userId,
    HOMOLOGATION_INCIDENT_REFERENCE:v.incidentReference,
    HOMOLOGATION_AUTH_TOKEN:v.authToken,
    HOMOLOGATION_TIMEOUT_MS:String(v.timeoutMs),
  }), {approved:true,targetCount:2});
});
