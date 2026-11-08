import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(new URL("../compose.alerts.yml", import.meta.url), "utf8");
const env = readFileSync(new URL("../.env.alerts.example", import.meta.url), "utf8");
const base = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");

test("alerts is a separate optional profile, without modifying the base package", () => {
  assert.match(compose, /alerts-app:\s*\n\s*profiles: \["alerts"\]/);
  assert.match(compose, /alerts-mysql:\s*\n\s*profiles: \["alerts"\]/);
  assert.match(compose, /alerts-migrate:\s*\n\s*profiles: \["alerts"\]/);
  assert.doesNotMatch(base, /alerts-app:/);
});

test("code is fetched from a pinned immutable upstream commit", () => {
  assert.match(compose, /central-despacho-alertas-publicacao\.git#[a-f0-9]{40}/);
  assert.match(compose, /target: migration/);
  assert.match(compose, /condition: service_completed_successfully/);
});

test("databases, permissions and readiness are independent", () => {
  assert.match(compose, /alerts_mysql_data:\/var\/lib\/mysql/);
  assert.match(compose, /- alerts-db-net/);
  assert.match(compose, /- alerts-api-net/);
  assert.match(compose, /- dispatch-net/);
  assert.match(compose, /ALERTS_JWT_SECRET:\?/);
  assert.match(compose, /127\.0\.0\.1:\$\{ALERTS_PORT:-3003\}:3000/);
  assert.match(compose, /\/health\/live/);
  assert.doesNotMatch(compose, /ALRT_INGRESS_MODE/);
  assert.match(env, /ALERTS_MYSQL_ROOT_PASSWORD=/);
  assert.match(env, /ALERTS_MYSQL_PASSWORD=/);
  assert.match(env, /ALERTS_JWT_SECRET=/);
});
