const baseUrl = process.env.LOCAL_AUTH_SMOKE_URL ?? "http://127.0.0.1:3000";
const username = process.env.LOCAL_AUTH_BOOTSTRAP_USERNAME ?? "";
const password = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD ?? "";
if (!username || !password) throw new Error("Credenciais locais ausentes para o smoke test.");

const created = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${baseUrl}/login`)}`, { method: "PUT" });
if (!created.ok) throw new Error("Não foi possível abrir uma página de navegador para validação.");
const target = await created.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const waiting = new Map();
socket.onmessage = event => { const message = JSON.parse(event.data); const done = waiting.get(message.id); if (done) { waiting.delete(message.id); done(message); } };
function call(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    waiting.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); reject(new Error(`Timeout em ${method}`)); } }, 15000);
  });
}
async function evaluate(expression) { const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Falha no navegador."); return result.result.value; }
async function waitFor(expression) { for (let step = 0; step < 50; step += 1) { try { if (await evaluate(expression)) return; } catch {} await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error("A interface não atingiu o estado esperado."); }

await call("Page.enable");
await call("Runtime.enable");
await waitFor("Boolean(document.querySelector('input[autocomplete=\"username\"]'))");
await evaluate(`(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const usernameInput = document.querySelector('input[autocomplete="username"]'); const passwordInput = document.querySelector('input[autocomplete="current-password"]'); set.call(usernameInput, ${JSON.stringify(username)}); usernameInput.dispatchEvent(new Event('input', { bubbles: true })); set.call(passwordInput, ${JSON.stringify(password)}); passwordInput.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
await waitFor("location.pathname === '/'");
await call("Page.navigate", { url: `${baseUrl}/ocorrencias` });
await waitFor("location.pathname === '/ocorrencias' && Boolean(document.body) && document.body.innerText.includes('Ocorrências')");
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await call("Page.navigate", { url: `${baseUrl}/ocorrencias` });
await waitFor("location.pathname === '/ocorrencias' && Boolean(document.body) && document.body.innerText.includes('Ocorrências')");
await evaluate(`fetch('/api/trpc/auth.logout?batch=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"0":{"json":null}}', credentials: 'include' })`);
socket.close();
console.log("browser_desktop_login=ok browser_mobile_protected_route=ok logout=ok");
