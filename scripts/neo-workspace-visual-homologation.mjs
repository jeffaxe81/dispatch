import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = 4174;
const URL = `http://${HOST}:${PORT}/`;
const NEO_ORIGIN = "https://gscprj.saas.digitro.cloud";
const outputDir = resolve("artifacts/neo-workspace-homologation");
const chromeProfile = resolve(`.tmp-neo-visual-chrome-${process.pid}`);

const ALLOWED_NETWORK_ERRORS = new Set([
  "net::ERR_ABORTED",
  "net::ERR_BLOCKED_BY_CLIENT",
  "net::ERR_BLOCKED_BY_RESPONSE",
  "net::ERR_CONNECTION_CLOSED",
  "net::ERR_CONNECTION_REFUSED",
  "net::ERR_CONNECTION_RESET",
  "net::ERR_FAILED",
  "net::ERR_INTERNET_DISCONNECTED",
  "net::ERR_NAME_NOT_RESOLVED",
  "net::ERR_TIMED_OUT",
]);

function sanitizeDiagnosticUrl(value) {
  if (value === "about:blank") return value;
  if (value.startsWith("data:")) return "data:<redacted>";
  if (value.startsWith("blob:")) return "blob:<redacted>";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `${url.protocol}<redacted>`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "<redacted-url>";
  }
}

function belongsToNeo(value) {
  try {
    return new URL(value).origin === NEO_ORIGIN;
  } catch {
    return false;
  }
}

function getHeader(headers, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === target) return String(value);
  }
  return undefined;
}

function classifyEmbedding(headers) {
  const csp = getHeader(headers, "content-security-policy") ?? "";
  const xFrameOptions = (getHeader(headers, "x-frame-options") ?? "").trim().toUpperCase();
  const frameAncestors = csp.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1]?.trim();

  if (frameAncestors) {
    const normalized = frameAncestors.toLowerCase();
    if (normalized.includes("'none'")) return "blocked";
    if (normalized === "'self'") return "same-origin-only";
    if (normalized.includes("*")) return "allow-all";
    return "allowlist-specific";
  }
  if (xFrameOptions === "DENY") return "blocked";
  if (xFrameOptions === "SAMEORIGIN") return "same-origin-only";
  return "not-declared";
}

function createNeoNetworkCollector(maxEntries = 50) {
  const requests = new Map();
  const documents = [];
  const failures = [];

  function pushBounded(target, value) {
    target.push(value);
    while (target.length > maxEntries) target.shift();
  }

  return {
    onRequest(event) {
      requests.set(event.requestId, {
        url: event.request?.url ?? "",
        resourceType: event.type,
      });
    },
    onResponse(event) {
      const response = event.response;
      if (event.type !== "Document" || !response || !belongsToNeo(response.url)) return;
      pushBounded(documents, {
        url: sanitizeDiagnosticUrl(response.url),
        status: response.status,
        mimeType: response.mimeType,
        embedding: classifyEmbedding(response.headers),
      });
    },
    onFailure(event) {
      const request = requests.get(event.requestId);
      requests.delete(event.requestId);
      if (!request || !belongsToNeo(request.url)) return;
      pushBounded(failures, {
        url: sanitizeDiagnosticUrl(request.url),
        error: ALLOWED_NETWORK_ERRORS.has(event.errorText)
          ? event.errorText
          : "<redacted-error>",
        ...(event.blockedReason ? { blockedReason: event.blockedReason } : {}),
        ...(request.resourceType ? { resourceType: request.resourceType } : {}),
        canceled: Boolean(event.canceled),
      });
    },
    snapshot() {
      return {
        neoDocumentObserved: documents.length > 0,
        documents: [...documents],
        failures: [...failures],
      };
    },
  };
}

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

async function waitForHttp(url, label) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }
  throw new Error(`${label} não iniciou: ${String(lastError)}`);
}

async function waitForDevTools(profilePath, chromeProcess, getChromeOutput) {
  const activePortFile = resolve(profilePath, "DevToolsActivePort");
  let lastError;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(
        `Chrome encerrou antes do DevTools iniciar (exit=${chromeProcess.exitCode}). ${getChromeOutput()}`,
      );
    }

    try {
      const value = await readFile(activePortFile, "utf8");
      const [portLine] = value.trim().split(/\r?\n/);
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) {
        await waitForHttp(`http://127.0.0.1:${port}/json/version`, "Chrome DevTools");
        return port;
      }
      lastError = new Error(`Porta inválida em DevToolsActivePort: ${portLine}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
  }

  throw new Error(
    `Chrome DevTools não iniciou: ${String(lastError)}. ${getChromeOutput()}`,
  );
}

function createCdpClient(socket) {
  let nextId = 0;
  const waiting = new Map();
  const listeners = new Map();

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method) {
      const methodListeners = listeners.get(message.method) ?? [];
      for (const listener of methodListeners) listener(message.params ?? {});
    }
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

  function on(method, listener) {
    const methodListeners = listeners.get(method) ?? [];
    methodListeners.push(listener);
    listeners.set(method, methodListeners);
  }

  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Falha no navegador.");
    }
    return result.result.value;
  }

  async function waitFor(expression) {
    for (let step = 0; step < 80; step += 1) {
      try {
        if (await evaluate(expression)) return;
      } catch {}
      await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
    }
    throw new Error("A interface NEO não atingiu o estado esperado.");
  }

  return { call, on, evaluate, waitFor };
}

function assertMetrics(metrics, label, expectedLayout, viewportWidth) {
  if (metrics.overflow !== "ok") throw new Error(`${label}: overflow horizontal detectado.`);
  if (metrics.iframe !== "configured") throw new Error(`${label}: iframe NEO não está configurado.`);
  if (metrics.layout !== expectedLayout) {
    throw new Error(`${label}: layout ${metrics.layout}; esperado ${expectedLayout}.`);
  }
  if (!metrics.dialogWidth || metrics.dialogWidth > viewportWidth - 4) {
    throw new Error(`${label}: diálogo excede a viewport (${metrics.dialogWidth}px > ${viewportWidth}px).`);
  }
  if (!metrics.iframeWidth || metrics.iframeWidth > metrics.dialogWidth) {
    throw new Error(`${label}: iframe excede o diálogo (${metrics.iframeWidth}px > ${metrics.dialogWidth}px).`);
  }
  if (expectedLayout === "desktop-split" && metrics.dialogWidth < 1000) {
    throw new Error(`${label}: workspace desktop estreito demais (${metrics.dialogWidth}px).`);
  }
}

async function capture(client, name, width, height, expectedLayout) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
  await client.call("Page.navigate", { url: URL });
  await client.waitFor(
    `document.readyState === "complete" &&
     document.body?.dataset.neoIframe === "configured" &&
     Number(document.body?.dataset.neoDialogWidth || 0) > 0`,
  );

  await new Promise(resolvePromise => setTimeout(resolvePromise, 5800));

  const metrics = await client.evaluate(`(() => ({
    overflow: document.body.dataset.neoOverflow,
    iframe: document.body.dataset.neoIframe,
    layout: document.body.dataset.neoLayout,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    dialogWidth: Number(document.body.dataset.neoDialogWidth || 0),
    iframeWidth: Number(document.body.dataset.neoIframeWidth || 0),
    statusText: Array.from(document.querySelectorAll('[role="dialog"]')).map(node => node.textContent || '').join(' ').includes('NEO Interact conectado ao container.') ? 'load-event' : 'loading-or-blocked'
  }))()`);

  assertMetrics(metrics, name, expectedLayout, width);

  const screenshot = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(resolve(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));

  const dom = await client.evaluate("document.documentElement.outerHTML");
  await writeFile(resolve(outputDir, `${name}.dom.html`), dom, "utf8");

  return { name, width, height, expectedLayout, ...metrics };
}

await mkdir(outputDir, { recursive: true });
await rm(chromeProfile, { recursive: true, force: true });

const vite = spawn(
  "corepack",
  [
    "pnpm",
    "exec",
    "vite",
    "--config",
    "vite.neo-visual.config.ts",
    "--host",
    HOST,
    "--port",
    String(PORT),
    "--strictPort",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "development" },
  },
);

let viteOutput = "";
vite.stdout.on("data", chunk => { viteOutput += chunk.toString(); });
vite.stderr.on("data", chunk => { viteOutput += chunk.toString(); });

let chrome;
let socket;

try {
  await waitForHttp(URL, "Servidor visual NEO");

  const chromeBin = findChrome();
  let chromeOutput = "";
  chrome = spawn(chromeBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.stdout.on("data", chunk => { chromeOutput += chunk.toString(); });
  chrome.stderr.on("data", chunk => { chromeOutput += chunk.toString(); });

  const debugPort = await waitForDevTools(chromeProfile, chrome, () => chromeOutput.slice(-4000));

  const created = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(URL)}`,
    { method: "PUT" },
  );
  if (!created.ok) throw new Error("Não foi possível abrir a página de homologação NEO.");
  const target = await created.json();

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.onopen = resolvePromise;
    socket.onerror = reject;
  });

  const client = createCdpClient(socket);
  const networkCollector = createNeoNetworkCollector();
  client.on("Network.requestWillBeSent", event => networkCollector.onRequest(event));
  client.on("Network.responseReceived", event => networkCollector.onResponse(event));
  client.on("Network.loadingFailed", event => networkCollector.onFailure(event));

  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Network.enable", {
    maxTotalBufferSize: 1_000_000,
    maxResourceBufferSize: 250_000,
  });

  const captures = [
    await capture(client, "desktop-1440x900", 1440, 900, "desktop-split"),
    await capture(client, "mobile-390x844", 390, 844, "mobile-stack"),
  ];

  const networkDiagnostics = networkCollector.snapshot();
  await writeFile(
    resolve(outputDir, "neo-network-diagnostics.json"),
    JSON.stringify(networkDiagnostics, null, 2) + "\n",
    "utf8",
  );

  const report = {
    status: "layout-approved",
    generatedAt: new Date().toISOString(),
    embeddedApplication: "NEO Interact",
    src: "https://gscprj.saas.digitro.cloud/neo/",
    origin: NEO_ORIGIN,
    note: "A aprovação automatizada cobre layout, configuração do iframe e ausência de overflow usando emulação real de viewport via Chrome DevTools. A coleta de rede é sanitizada e registra somente URLs sem query/fragment, respostas Document da origem NEO e falhas técnicas da origem NEO.",
    externalCompatibility: {
      neoDocumentObserved: networkDiagnostics.neoDocumentObserved,
      documentResponses: networkDiagnostics.documents.length,
      networkFailures: networkDiagnostics.failures.length,
    },
    captures,
  };

  await writeFile(
    resolve(outputDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );

  console.log(
    `neo_workspace_visual=layout-approved desktop=desktop-split mobile=mobile-stack viewport=cdp overflow=ok iframe=configured neo_document=${networkDiagnostics.neoDocumentObserved ? "observed" : "not-observed"} neo_failures=${networkDiagnostics.failures.length}`,
  );
} catch (error) {
  console.error(viteOutput);
  throw error;
} finally {
  socket?.close();

  if (chrome && chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await new Promise(resolvePromise => {
      const timeout = setTimeout(resolvePromise, 3000);
      chrome.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
  }

  if (vite.exitCode === null) {
    vite.kill("SIGTERM");
    await new Promise(resolvePromise => {
      const timeout = setTimeout(resolvePromise, 2000);
      vite.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
  }

  await rm(chromeProfile, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  });
}
