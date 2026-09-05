import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { waitForLoginProbe } from "./neo-auth-navigation.mjs";

const HOST = "127.0.0.1";
const PORT = 4175;
const APP_URL = `http://${HOST}:${PORT}/`;
const NEO_URL = "https://gscprj.saas.digitro.cloud/neo/";
const NEO_ORIGIN = "https://gscprj.saas.digitro.cloud";
const profile = resolve(`.tmp-neo-auth-iframe-${process.pid}`);

const username = process.env.NEO_AUTH_USERNAME?.trim();
const password = process.env.NEO_AUTH_PASSWORD;

if (!username || !password) {
  console.log("neo_authenticated_iframe_smoke={\"status\":\"skipped-no-credentials\"}");
  process.exit(0);
}

function belongsToNeo(value) {
  try { return new URL(value).origin === NEO_ORIGIN; } catch { return false; }
}

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const check = spawnSync("bash", ["-lc", `command -v ${candidate}`], { encoding: "utf8" });
    if (check.status === 0) return check.stdout.trim();
  }
  throw new Error("Chrome/Chromium não encontrado no executor.");
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw new Error("Servidor visual NEO não iniciou.");
}

async function waitForDevTools(chromeProcess) {
  const activePortFile = resolve(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (chromeProcess.exitCode !== null) throw new Error("Chrome encerrou antes do DevTools iniciar.");
    try {
      const [portLine] = (await readFile(activePortFile, "utf8")).trim().split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw new Error("Chrome DevTools não iniciou.");
}

function createClient(socket) {
  let nextId = 0;
  const waiting = new Map();
  const listeners = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
    const done = waiting.get(message.id);
    if (done) {
      waiting.delete(message.id);
      done(message);
    }
  };
  function call(method, params = {}) {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      waiting.set(id, message => message.error ? reject(new Error(message.error.message)) : resolvePromise(message.result));
      setTimeout(() => {
        if (waiting.has(id)) {
          waiting.delete(id);
          reject(new Error(`Timeout em ${method}`));
        }
      }, 20_000);
    });
  }
  function on(method, listener) {
    const current = listeners.get(method) ?? [];
    current.push(listener);
    listeners.set(method, current);
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Falha ao avaliar estado da página.");
    return result.result.value;
  }
  return { call, on, evaluate };
}

async function removeProfileSafely() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 7) return;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    }
  }
}

await removeProfileSafely();
const vite = spawn("corepack", ["pnpm", "exec", "vite", "--config", "vite.neo-visual.config.ts", "--host", HOST, "--port", String(PORT), "--strictPort"], {
  stdio: ["ignore", "ignore", "ignore"],
  env: { ...process.env, NODE_ENV: "development" },
});

let chromeProcess;
let socket;
try {
  await waitForHttp(APP_URL);
  chromeProcess = spawn(findChrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"] });

  const port = await waitForDevTools(chromeProcess);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.onopen = resolvePromise;
    socket.onerror = () => reject(new Error("Falha ao conectar no Chrome DevTools."));
  });

  const client = createClient(socket);
  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Network.enable");

  const navigation = await client.call("Page.navigate", { url: NEO_URL });
  if (navigation.errorText) throw new Error("Falha ao navegar para o NEO.");

  const probe = await waitForLoginProbe(async () => client.evaluate(`(() => {
    const password = document.querySelector('input[type="password"]');
    const username = document.querySelector('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="login" i], input[id*="login" i], input[type="text"]');
    return { url: location.href, hasPassword: Boolean(password), hasUsername: Boolean(username) };
  })()`), { attempts: 50, delayMs: 150, neoOrigin: NEO_ORIGIN });

  if (probe.status !== "login-form-found" && probe.status !== "authenticated") {
    console.log(`neo_authenticated_iframe_smoke=${JSON.stringify({ status: probe.status })}`);
    process.exitCode = 3;
  } else {
    if (probe.status === "login-form-found") {
      const payload = JSON.stringify({ username, password });
      await client.evaluate(`(() => {
        const credentials = ${payload};
        const password = document.querySelector('input[type="password"]');
        const username = document.querySelector('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="login" i], input[id*="login" i], input[type="text"]');
        if (!password || !username) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(username, credentials.username);
        username.dispatchEvent(new Event('input', { bubbles: true }));
        username.dispatchEvent(new Event('change', { bubbles: true }));
        setter?.call(password, credentials.password);
        password.dispatchEvent(new Event('input', { bubbles: true }));
        password.dispatchEvent(new Event('change', { bubbles: true }));
        const form = password.closest('form') || username.closest('form');
        const submit = form?.querySelector('button[type="submit"], input[type="submit"], button') || document.querySelector('button[type="submit"], input[type="submit"]');
        if (submit) submit.click(); else form?.requestSubmit?.();
        credentials.username = ''; credentials.password = '';
        return true;
      })()`);

      let authenticated = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const state = await client.evaluate(`(() => ({ url: location.href, hasPassword: Boolean(document.querySelector('input[type="password"]')) }))()`);
        if (!state.hasPassword && belongsToNeo(state.url)) { authenticated = true; break; }
        await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
      }
      if (!authenticated) throw new Error("Autenticação NEO não foi confirmada.");
    }

    const pending = new Map();
    const iframeEvidence = { documentObserved: false, cookieSent: false, responseStatus: null, failure: null };
    let iframePhase = false;

    client.on("Network.requestWillBeSent", event => {
      if (!iframePhase || event.type !== "Document" || !belongsToNeo(event.request?.url ?? "")) return;
      pending.set(event.requestId, true);
      iframeEvidence.documentObserved = true;
      const headers = event.request?.headers ?? {};
      iframeEvidence.cookieSent ||= Object.keys(headers).some(key => key.toLowerCase() === "cookie");
    });
    client.on("Network.requestWillBeSentExtraInfo", event => {
      if (!iframePhase || !pending.has(event.requestId)) return;
      const headers = event.headers ?? {};
      iframeEvidence.cookieSent ||= Object.keys(headers).some(key => key.toLowerCase() === "cookie");
      iframeEvidence.cookieSent ||= Array.isArray(event.associatedCookies) && event.associatedCookies.some(item => (item.blockedReasons?.length ?? 0) === 0);
    });
    client.on("Network.responseReceived", event => {
      if (!iframePhase || !pending.has(event.requestId)) return;
      iframeEvidence.responseStatus = event.response?.status ?? null;
    });
    client.on("Network.loadingFailed", event => {
      if (!iframePhase || !pending.has(event.requestId)) return;
      iframeEvidence.failure = /^net::ERR_[A-Z0-9_]+$/.test(event.errorText ?? "") ? event.errorText : "<redacted-error>";
    });

    iframePhase = true;
    await client.call("Page.navigate", { url: APP_URL });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (iframeEvidence.documentObserved && (iframeEvidence.responseStatus !== null || iframeEvidence.failure)) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    }

    const status = iframeEvidence.documentObserved && iframeEvidence.cookieSent && !iframeEvidence.failure && Number(iframeEvidence.responseStatus) >= 200 && Number(iframeEvidence.responseStatus) < 400
      ? "authenticated-iframe-observed"
      : "iframe-session-not-proven";
    console.log(`neo_authenticated_iframe_smoke=${JSON.stringify({ status, ...iframeEvidence })}`);
    if (status !== "authenticated-iframe-observed") process.exitCode = 4;
  }
} finally {
  socket?.close();
  if (chromeProcess?.exitCode === null) chromeProcess.kill("SIGTERM");
  if (vite.exitCode === null) vite.kill("SIGTERM");
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  await removeProfileSafely();
}
