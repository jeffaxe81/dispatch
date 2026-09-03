import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = 4174;
const DEBUG_PORT = 9223;
const URL = `http://${HOST}:${PORT}/`;
const outputDir = resolve("artifacts/neo-workspace-homologation");
const chromeProfile = resolve(`.tmp-neo-visual-chrome-${process.pid}`);

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

function createCdpClient(socket) {
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

  return { call, evaluate, waitFor };
}

function assertMetrics(metrics, label, expectedLayout, viewportWidth) {
  if (metrics.overflow !== "ok") {
    throw new Error(`${label}: overflow horizontal detectado.`);
  }
  if (metrics.iframe !== "configured") {
    throw new Error(`${label}: iframe NEO não está configurado.`);
  }
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

  // Aguarda a segunda inspeção do harness e dá tempo para o iframe externo responder,
  // sem considerar a resposta externa requisito para aprovação do layout.
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
  chrome = spawn(chromeBin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, "Chrome DevTools");

  const created = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(URL)}`,
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
  await client.call("Page.enable");
  await client.call("Runtime.enable");

  const captures = [
    await capture(client, "desktop-1440x900", 1440, 900, "desktop-split"),
    await capture(client, "mobile-390x844", 390, 844, "mobile-stack"),
  ];

  const report = {
    status: "layout-approved",
    generatedAt: new Date().toISOString(),
    embeddedApplication: "NEO Interact",
    src: "https://gscprj.saas.digitro.cloud/neo/",
    origin: "https://gscprj.saas.digitro.cloud",
    note: "A aprovação automatizada cobre layout, configuração do iframe e ausência de overflow usando emulação real de viewport via Chrome DevTools. O carregamento cross-origin do conteúdo NEO permanece uma homologação externa separada.",
    captures,
  };

  await writeFile(
    resolve(outputDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );

  console.log(
    "neo_workspace_visual=layout-approved desktop=desktop-split mobile=mobile-stack viewport=cdp overflow=ok iframe=configured",
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
