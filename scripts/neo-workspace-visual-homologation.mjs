import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = 4174;
const URL = `http://${HOST}:${PORT}/`;
const outputDir = resolve("artifacts/neo-workspace-homologation");

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const check = spawnSync("bash", ["-lc", `command -v ${candidate}`], {
      encoding: "utf8",
    });
    if (check.status === 0) return check.stdout.trim();
  }

  throw new Error("Chrome/Chromium não encontrado no executor.");
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Servidor visual NEO não iniciou: ${String(lastError)}`);
}

function runChrome(chrome, args) {
  const result = spawnSync(chrome, args, {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Chrome falhou (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function chromeArgs(width, height) {
  return [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    "--virtual-time-budget=7000",
    URL,
  ];
}

function assertDom(dom, label, expectedLayout) {
  const required = [
    'data-neo-overflow="ok"',
    'data-neo-iframe="configured"',
    `data-neo-layout="${expectedLayout}"`,
    "Ocorrência + NEO Interact",
    "OC-2026-127",
    "Iluminação pública",
    "Separação de contexto:",
    "https://gscprj.saas.digitro.cloud/neo/",
  ];
  const missing = required.filter(token => !dom.includes(token));
  if (missing.length > 0) {
    throw new Error(`${label}: evidência visual incompleta: ${missing.join(", ")}`);
  }
}

async function capture(chrome, name, width, height, expectedLayout) {
  const screenshot = resolve(outputDir, `${name}.png`);
  runChrome(chrome, [
    ...chromeArgs(width, height).slice(0, -1),
    `--screenshot=${screenshot}`,
    URL,
  ]);

  const dom = runChrome(chrome, [
    ...chromeArgs(width, height).slice(0, -1),
    "--dump-dom",
    URL,
  ]);
  assertDom(dom, name, expectedLayout);
  await writeFile(resolve(outputDir, `${name}.dom.html`), dom, "utf8");

  const dialogWidth = dom.match(/data-neo-dialog-width="(\d+)"/)?.[1] ?? null;
  const iframeWidth = dom.match(/data-neo-iframe-width="(\d+)"/)?.[1] ?? null;

  return { name, width, height, expectedLayout, dialogWidth, iframeWidth };
}

await mkdir(outputDir, { recursive: true });

const server = spawn(
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

let serverOutput = "";
server.stdout.on("data", chunk => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", chunk => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();
  const chrome = findChrome();
  const captures = [
    await capture(chrome, "desktop-1440x900", 1440, 900, "desktop-split"),
    await capture(chrome, "mobile-390x844", 390, 844, "mobile-stack"),
  ];

  const report = {
    status: "layout-approved",
    generatedAt: new Date().toISOString(),
    embeddedApplication: "NEO Interact",
    src: "https://gscprj.saas.digitro.cloud/neo/",
    origin: "https://gscprj.saas.digitro.cloud",
    note: "A aprovação automatizada cobre layout, configuração do iframe e ausência de overflow. A renderização cross-origin do conteúdo NEO deve ser confirmada pela revisão da captura e pela homologação do provedor.",
    captures,
  };
  await writeFile(
    resolve(outputDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );

  console.log(
    "neo_workspace_visual=layout-approved desktop=desktop-split mobile=mobile-stack overflow=ok iframe=configured",
  );
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  server.kill("SIGTERM");
}
