import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HOST = "127.0.0.1";
const PORT = 4173;
const URL = `http://${HOST}:${PORT}/`;
const outputDir = resolve("artifacts/gis-homologation");

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
  throw new Error(`Servidor visual não iniciou: ${String(lastError)}`);
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
    "--virtual-time-budget=6000",
    URL,
  ];
}

function runChrome(chrome, args) {
  const result = spawnSync(chrome, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Chrome falhou (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function assertDom(dom, label) {
  const required = [
    'data-gis-overflow="ok"',
    'data-gis-leaflet="ready"',
    "GIS-1 — Homologação visual",
    "OpenStreetMap / Leaflet",
    "Mapa operacional",
    "3 ocorrência(s) · 2 equipe(s) posicionada(s)",
    "OpenStreetMap contributors",
  ];
  const missing = required.filter(token => !dom.includes(token));
  if (missing.length > 0) {
    throw new Error(
      `${label}: evidência DOM incompleta: ${missing.join(", ")}`,
    );
  }
}

async function capture(chrome, name, width, height) {
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
  assertDom(dom, name);
  await writeFile(resolve(outputDir, `${name}.dom.html`), dom, "utf8");

  return { name, width, height, screenshot };
}

await mkdir(outputDir, { recursive: true });

const server = spawn(
  "corepack",
  [
    "pnpm",
    "exec",
    "vite",
    "--config",
    "vite.gis-visual.config.ts",
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
  const results = [
    await capture(chrome, "desktop-1440x900", 1440, 900),
    await capture(chrome, "mobile-390x844", 390, 844),
  ];

  const report = {
    status: "approved",
    generatedAt: new Date().toISOString(),
    provider: "OpenStreetMap / Leaflet",
    routeGeometry: "GeoJSON LineString",
    overflow: "ok",
    leaflet: "ready",
    captures: results.map(({ name, width, height }) => ({
      name,
      width,
      height,
    })),
  };
  await writeFile(
    resolve(outputDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  console.log(
    "gis_visual_homologation=approved desktop=1440x900 mobile=390x844 overflow=ok leaflet=ready",
  );
} catch (error) {
  console.error(serverOutput);
  throw error;
} finally {
  server.kill("SIGTERM");
}
