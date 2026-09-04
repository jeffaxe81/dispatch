import { spawn, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { summarizeNavigateResult } from "./neo-auth-navigation.mjs";

const NEO_URL = "https://gscprj.saas.digitro.cloud/neo/";
const profile = resolve(`.tmp-neo-chrome-preflight-${process.pid}`);

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
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
    if (done) {
      waiting.delete(message.id);
      done(message);
    }
  };
  function call(method, params = {}) {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      waiting.set(id, message => {
        if (message.error) reject(new Error(message.error.message));
        else resolvePromise(message.result);
      });
      setTimeout(() => {
        if (waiting.has(id)) {
          waiting.delete(id);
          reject(new Error(`Timeout em ${method}`));
        }
      }, 20_000);
    });
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true });
    return result.result.value;
  }
  return { call, evaluate };
}

await rm(profile, { recursive: true, force: true });
const chrome = findChrome();
const chromeProcess = spawn(chrome, [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

try {
  const port = await waitForDevTools(chromeProcess);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  const target = await targetResponse.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.onopen = resolvePromise;
    socket.onerror = () => reject(new Error("Falha ao conectar no Chrome DevTools."));
  });
  const client = createClient(socket);
  await client.call("Page.enable");
  await client.call("Runtime.enable");
  const navigation = await client.call("Page.navigate", { url: NEO_URL });
  await new Promise(resolvePromise => setTimeout(resolvePromise, 1500));
  const currentUrl = await client.evaluate("location.href");
  const summary = summarizeNavigateResult({
    errorText: navigation.errorText,
    currentUrl,
  });
  console.log(`neo_chrome_navigation_preflight=${JSON.stringify(summary)}`);
  socket.close();
} finally {
  chromeProcess.kill("SIGTERM");
  await rm(profile, { recursive: true, force: true });
}
