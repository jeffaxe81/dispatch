import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyNeoAuthNavigation,
  summarizeNavigateResult,
  summarizePageStructure,
  waitForLoginProbe,
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
      readyState: "interactive",
      forms: 1,
      iframes: 0,
      shadowHosts: 0,
      inputs: ["text", "password", "text", "checkbox"],
      text: "do not persist",
      value: "secret",
    }),
    {
      readyState: "interactive",
      forms: 1,
      iframes: 0,
      shadowHosts: 0,
      inputTypes: { text: 2, password: 1, email: 0, hidden: 0, other: 1 },
    },
  );
});

test("waits for delayed login fields instead of failing immediately", async () => {
  let attempt = 0;
  const result = await waitForLoginProbe(async () => {
    attempt += 1;
    if (attempt < 3) {
      return {
        url: "https://gscprj.saas.digitro.cloud/neo/login",
        hasPassword: false,
        hasUsername: false,
      };
    }
    return {
      url: "https://gscprj.saas.digitro.cloud/neo/login",
      hasPassword: true,
      hasUsername: true,
    };
  }, { attempts: 5, delayMs: 0, neoOrigin: "https://gscprj.saas.digitro.cloud" });

  assert.equal(attempt, 3);
  assert.equal(result.status, "login-form-found");
  assert.equal(result.hasPassword, true);
  assert.equal(result.hasUsername, true);
});

test("does not treat the NEO root shell as authenticated before delayed login renders", async () => {
  let attempt = 0;
  const result = await waitForLoginProbe(async () => {
    attempt += 1;
    if (attempt < 4) {
      return {
        url: "https://gscprj.saas.digitro.cloud/neo/",
        hasPassword: false,
        hasUsername: false,
      };
    }
    return {
      url: "https://gscprj.saas.digitro.cloud/neo/",
      hasPassword: true,
      hasUsername: true,
    };
  }, {
    attempts: 6,
    delayMs: 0,
    neoOrigin: "https://gscprj.saas.digitro.cloud",
    authenticatedMinAttempts: 4,
  });

  assert.equal(attempt, 4);
  assert.equal(result.status, "login-form-found");
});
