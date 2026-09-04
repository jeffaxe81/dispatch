import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { waitForLoginProbe } from "./neo-auth-navigation.mjs";

const NEO_URL = "https://gscprj.saas.digitro.cloud/neo/";
const NEO_ORIGIN = "https://gscprj.saas.digitro.cloud";
const profile = resolve(`.tmp-neo-auth-storage-${process.pid}`);
const username = process.env.NEO_AUTH_USERNAME?.trim();
const password = process.env.NEO_AUTH_PASSWORD;

if (!username || !password) {
  console.log('neo_auth_storage_policy={"status":"skipped-no-credentials"}');
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
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const done = waiting.get(message.id);
    if (done) { waiting.delete(message.id); done(message); }
  };
  function call(method, params = {}) {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      waiting.set(id, message => message.error ? reject(new Error(message.error.message)) : resolvePromise(message.result));
      setTimeout(() => {
        if (waiting.has(id)) { waiting.delete(id); reject(new Error(`Timeout em ${method}`)); }
      }, 20_000);
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Falha ao avaliar estado da página.");
    return result.result.value;
  }
  return { call, evaluate };
}

async function removeProfileSafely() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { await rm(profile, { recursive: true, force: true }); return; }
    catch { if (attempt === 7) return; await new Promise(resolvePromise => setTimeout(resolvePromise, 150)); }
  }
}

await removeProfileSafely();
const chromeProcess = spawn(findChrome(), [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

let socket;
try {
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
  const navigation = await client.call("Page.navigate", { url: NEO_URL });
  if (navigation.errorText) throw new Error("Falha ao navegar para o NEO.");

  const probe = await waitForLoginProbe(async () => client.evaluate(`(() => {
    const password = document.querySelector('input[type="password"]');
    const username = document.querySelector('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="login" i], input[id*="login" i], input[type="text"]');
    return { url: location.href, hasPassword: Boolean(password), hasUsername: Boolean(username) };
  })()`), { attempts: 50, delayMs: 150, neoOrigin: NEO_ORIGIN });

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
  }

  let authenticated = probe.status === "authenticated";
  for (let attempt = 0; !authenticated && attempt < 60; attempt += 1) {
    const state = await client.evaluate(`(() => ({ url: location.href, hasPassword: Boolean(document.querySelector('input[type="password"]')) }))()`);
    if (!state.hasPassword && belongsToNeo(state.url)) authenticated = true;
    else await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  if (!authenticated) throw new Error("Autenticação NEO não foi confirmada.");

  const storage = await client.evaluate(`(async () => ({
    localStorageEntries: localStorage.length,
    sessionStorageEntries: sessionStorage.length,
    indexedDbDatabases: typeof indexedDB?.databases === 'function' ? (await indexedDB.databases()).length : null,
  }))()`);
  const safe = {
    status: "authenticated",
    localStorageEntries: Number(storage?.localStorageEntries || 0),
    sessionStorageEntries: Number(storage?.sessionStorageEntries || 0),
    indexedDbDatabases: storage?.indexedDbDatabases === null ? null : Number(storage?.indexedDbDatabases || 0),
  };
  console.log(`neo_auth_storage_policy=${JSON.stringify(safe)}`);
} finally {
  socket?.close();
  chromeProcess.kill("SIGTERM");
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  await removeProfileSafely();
}
