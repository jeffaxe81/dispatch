import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signature = readFileSync(new URL("../compose.signature.yml", import.meta.url), "utf8");
const base = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const alerts = readFileSync(new URL("../compose.alerts.yml", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const doc = readFileSync(new URL("../docs/signature-bundle.md", import.meta.url), "utf8");

test("signature is an optional independent Docker Compose module", () => {
  assert.match(signature, /signature-app:\s*\n\s*profiles: \["signature"\]/);
  assert.doesNotMatch(base, /signature-app:/);
  assert.doesNotMatch(alerts, /signature-app:/);
  assert.doesNotMatch(signature, /depends_on:/);
  assert.match(signature, /- signature-api-net/);
  assert.match(signature, /- dispatch-net/);
});

test("signature is build-pinned and listens on local loopback only", () => {
  assert.match(signature, /axesistemas-signature-service\.git#[a-f0-9]{40}/);
  assert.match(signature, /127\.0\.0\.1:\$\{SIGNATURE_PORT:-3004\}:3000/);
  assert.match(signature, /\/health/);
  assert.doesNotMatch(signature, /ports:\s*\n\s*- "3004:3000"/);
});

test("package leaves real signing inactive", () => {
  assert.doesNotMatch(signature, /TRUST_MODE:\s*fake|FAKE_SIGNING_ENABLED:\s*true/);
  assert.match(doc, /apenas.*endpoint.*GET \/health/s);
  assert.match(doc, /não instancia repositório nem conexão/s);
});

test("independent credentials and source checkout are ignored", () => {
  assert.match(gitignore, /^\.env\.signature$/m);
  assert.match(gitignore, /^\.modules\/signature\/$/m);
});
