import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.LOCAL_AUTH_SMOKE_URL ?? "http://127.0.0.1:3000";
const username = process.env.LOCAL_AUTH_BOOTSTRAP_USERNAME ?? "";
const password = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD ?? "";
const outputDir = process.env.JORNADA_VISUAL_OUTPUT ?? "artifacts/jornada-visual";

if (!username || !password) throw new Error("Credenciais locais ausentes para homologação visual.");
await mkdir(outputDir, { recursive: true });

const created = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: "PUT" });
if (!created.ok) throw new Error("Não foi possível abrir uma página do Chrome para homologação visual.");
const target = await created.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

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
  return new Promise((resolve, reject) => {
    waiting.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id);
        reject(new Error(`Timeout em ${method}`));
      }
    }, 20000);
  });
}

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Falha no navegador.");
  return result.result.value;
}

async function waitFor(expression) {
  for (let step = 0; step < 80; step += 1) {
    try {
      if (await evaluate(expression)) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`A interface não atingiu o estado esperado: ${expression}`);
}

async function capture(name, width, height, mobile) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
  await call("Page.navigate", { url: `${baseUrl}/jornada` });
  await waitFor("location.pathname === '/jornada' && document.body.innerText.includes('Jornada em Tempo Real')");
  await new Promise(resolve => setTimeout(resolve, 500));

  const diagnostics = await evaluate(`(() => ({
    pathname: location.pathname,
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    hasHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    headingVisible: document.body.innerText.includes('Jornada em Tempo Real'),
    stateVisible: /Fora da jornada|Em jornada|Em intervalo|Encerrada/.test(document.body.innerText),
    actionVisible: /Iniciar jornada|Iniciar nova jornada|Iniciar intervalo|Retomar jornada|Encerrar jornada/.test(document.body.innerText),
    historyVisible: document.body.innerText.includes('Histórico recente'),
  }))()`);

  if (diagnostics.hasHorizontalOverflow) {
    throw new Error(`${name}: overflow horizontal detectado (${diagnostics.documentWidth}px > ${diagnostics.viewport.width}px).`);
  }
  if (!diagnostics.headingVisible || !diagnostics.stateVisible || !diagnostics.actionVisible || !diagnostics.historyVisible) {
    throw new Error(`${name}: elementos essenciais da Jornada não estão visíveis.`);
  }

  const screenshot = await call("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(`${outputDir}/jornada-${name}.png`, Buffer.from(screenshot.data, "base64"));
  return diagnostics;
}

await call("Page.enable");
await call("Runtime.enable");
await waitFor("Boolean(document.querySelector('input[autocomplete=\"username\"]'))");
await evaluate(`(() => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const usernameInput = document.querySelector('input[autocomplete="username"]');
  const passwordInput = document.querySelector('input[autocomplete="current-password"]');
  set.call(usernameInput, ${JSON.stringify(username)});
  usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
  set.call(passwordInput, ${JSON.stringify(password)});
  passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('form').requestSubmit();
})()`);
await waitFor("location.pathname === '/'");

const desktop = await capture("desktop-1440x900", 1440, 900, false);
const mobile = await capture("mobile-390x844", 390, 844, true);

await writeFile(`${outputDir}/diagnostics.json`, JSON.stringify({ desktop, mobile }, null, 2));
socket.close();
console.log("jornada_visual_desktop=ok jornada_visual_mobile=ok overflow_horizontal=none");
