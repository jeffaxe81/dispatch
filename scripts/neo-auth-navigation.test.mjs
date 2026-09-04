import test from "node:test";
import assert from "node:assert/strict";
import { classifyNeoAuthNavigation } from "./neo-auth-navigation.mjs";

test("classifies Chrome internal error pages as network errors", () => {
  assert.equal(
    classifyNeoAuthNavigation({
      url: "chrome-error://chromewebdata/",
      hasPassword: false,
      hasUsername: false,
      neoOrigin: "https://gscprj.saas.digitro.cloud",
    }),
    "network-error",
  );
});

test("classifies external HTTP redirects without a login form as redirect or SSO", () => {
  assert.equal(
    classifyNeoAuthNavigation({
      url: "https://login.example.test/oauth2/authorize?token=secret",
      hasPassword: false,
      hasUsername: false,
      neoOrigin: "https://gscprj.saas.digitro.cloud",
    }),
    "redirect-or-sso",
  );
});

test("keeps NEO login pages without recognizable fields as login-form-not-found", () => {
  assert.equal(
    classifyNeoAuthNavigation({
      url: "https://gscprj.saas.digitro.cloud/neo/login",
      hasPassword: false,
      hasUsername: false,
      neoOrigin: "https://gscprj.saas.digitro.cloud",
    }),
    "login-form-not-found",
  );
});

test("recognizes an already authenticated NEO page", () => {
  assert.equal(
    classifyNeoAuthNavigation({
      url: "https://gscprj.saas.digitro.cloud/neo/app",
      hasPassword: false,
      hasUsername: false,
      neoOrigin: "https://gscprj.saas.digitro.cloud",
    }),
    "authenticated",
  );
});
