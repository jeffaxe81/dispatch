import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyNeoAuthNavigation,
  summarizeNavigateResult,
  summarizePageStructure,
} from "./neo-auth-navigation.mjs";

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

test("preserves only allowlisted Chrome navigation error codes", () => {
  assert.deepEqual(
    summarizeNavigateResult({
      errorText: "net::ERR_NAME_NOT_RESOLVED",
      currentUrl: "chrome-error://chromewebdata/",
    }),
    {
      navigationError: "net::ERR_NAME_NOT_RESOLVED",
      finalProtocol: "chrome-error:",
    },
  );

  assert.deepEqual(
    summarizeNavigateResult({
      errorText: "private backend detail token=secret",
      currentUrl: "https://login.example.test/oauth?token=secret",
    }),
    {
      navigationError: "<redacted-error>",
      finalProtocol: "https:",
    },
  );
});

test("summarizes page structure without text, values or selectors", () => {
  assert.deepEqual(
    summarizePageStructure({
      readyState: "complete",
      forms: 2,
      iframes: 1,
      shadowHosts: 3,
      inputs: ["text", "password", "email", "hidden", "custom-secret-type"],
    }),
    {
      readyState: "complete",
      forms: 2,
      iframes: 1,
      shadowHosts: 3,
      inputTypes: {
        text: 1,
        password: 1,
        email: 1,
        hidden: 1,
        other: 1,
      },
    },
  );
});
