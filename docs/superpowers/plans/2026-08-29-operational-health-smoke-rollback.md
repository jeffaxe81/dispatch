# D-004 Operational Health, Smoke Test and Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor liveness e readiness HTTP, verificar banco e armazenamento com segurança, fornecer smoke test pós-publicação e documentar rollback da aplicação.

**Architecture:** Um módulo de saúde isolado registra rotas Express e avalia checks injetáveis; os adaptadores padrão usam `SELECT 1` e a leitura de um byte de um objeto sentinela. A seleção de porta e o smoke test ficam em unidades separadas, enquanto o runbook permanece independente da plataforma de deploy.

**Tech Stack:** Node.js 24, TypeScript 5.9, Express 4, Drizzle ORM/MySQL, Vitest 2, pnpm 10.4.1 e GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-29-operational-health-smoke-rollback-design.md`

## Global Constraints

- Base obrigatória: `checkpoint/d003-v1.15.3`.
- Versão planejada: `1.15.4`.
- Liveness nunca consulta dependência externa.
- Readiness exige banco e armazenamento, sem resultado parcialmente aprovado.
- Timeout por check: `2_000` ms.
- Sentinela configurada por `STORAGE_HEALTHCHECK_KEY`; healthcheck não cria nem exclui objetos.
- Respostas públicas contêm somente `alive`, `ready`, `not_ready`, `ok` e `failed`.
- `Cache-Control` deve ser `no-store`.
- Smoke usa `SMOKE_BASE_URL` e `SMOKE_TIMEOUT_MS`, sem credenciais.
- Produção usa exatamente `PORT`; somente desenvolvimento procura porta alternativa.
- Nenhum deploy, rollback, alteração de banco ou merge automático.
- O contrato tRPC `system.health` e o endpoint ALRT permanecem inalterados.

## File Map

| Arquivo | Responsabilidade |
|---|---|
| `server/_core/operationalHealth.ts` | Checks, timeout, respostas sanitizadas e rotas HTTP |
| `server/_core/operationalHealth.test.ts` | Contratos das rotas e adaptadores injetados |
| `server/_core/serverPort.ts` | Validação e seleção de porta por ambiente |
| `server/_core/serverPort.test.ts` | Regressão da porta fixa de produção |
| `server/_core/index.ts` | Compor rotas e selecionar porta; sem lógica de check |
| `server/_core/env.ts` | Ler `STORAGE_HEALTHCHECK_KEY` |
| `server/storage.ts` | Reutilizar URL assinada existente; nenhuma nova gravação |
| `scripts/post-deploy-smoke.mjs` | Consumir liveness, readiness e raiz externamente |
| `server/postDeploySmoke.test.ts` | Executar o CLI contra servidor HTTP controlado |
| `package.json` | Script `smoke:post-deploy` e versão 1.15.4 |
| `scripts/security-regression-check.mjs` | Reconhecer a versão segura e preservar controles |
| `docs/source-package/ROLLBACK_OPERACIONAL.md` | Procedimento de retorno da aplicação |
| `docs/source-package/DEPLOY_CONTEINERIZADO.md` | Corrigir limites e documentar checks pós-publicação |
| `docs/decisions/D004-operational-health-smoke-rollback.md` | Registrar decisão e trade-offs |
| `docs/source-package/CHANGELOG.md` | Histórico didático da versão |

---

### Task 1: Contratos HTTP de liveness e readiness

**Files:**
- Create: `server/_core/operationalHealth.ts`
- Create: `server/_core/operationalHealth.test.ts`
- Modify: `server/_core/index.ts`

**Interfaces:**
- Consumes: `Express` e checks `() => Promise<void>`.
- Produces: `registerOperationalHealthRoutes(app, options?)`, `evaluateReadiness(options)` e tipos `ReadinessResult`, `OperationalHealthOptions`.

- [ ] **Step 1: Escrever testes vermelhos das rotas**

Criar um aplicativo Express em porta efêmera e injetar checks simulados. Cobrir o seguinte contrato:

```ts
const checks = {
  checkDatabase: vi.fn().mockResolvedValue(undefined),
  checkStorage: vi.fn().mockResolvedValue(undefined),
  timeoutMs: 2_000,
};

registerOperationalHealthRoutes(app, checks);

expect(await get("/health/live")).toMatchObject({
  status: 200,
  cacheControl: "no-store",
  body: { status: "alive" },
});
expect(checks.checkDatabase).not.toHaveBeenCalled();
expect(checks.checkStorage).not.toHaveBeenCalled();
```

Adicionar casos de readiness totalmente aprovada, banco falho, storage falho, duas falhas e timeout. Em toda falha, procurar e rejeitar `mysql://`, `Bearer`, `https://storage`, `stack` e o texto do erro injetado.

- [ ] **Step 2: Confirmar estado vermelho**

Run:

```bash
corepack pnpm vitest run server/_core/operationalHealth.test.ts --pool=forks --poolOptions.forks.singleFork
```

Expected: FAIL porque `operationalHealth.ts` e as funções exportadas ainda não existem.

- [ ] **Step 3: Implementar avaliação e rotas mínimas**

Implementar os contratos:

```ts
export type HealthCheckState = "ok" | "failed";

export type ReadinessResult = {
  status: "ready" | "not_ready";
  checks: { database: HealthCheckState; storage: HealthCheckState };
};

export type OperationalHealthOptions = {
  checkDatabase: () => Promise<void>;
  checkStorage: () => Promise<void>;
  timeoutMs?: number;
};

export async function evaluateReadiness(
  options: OperationalHealthOptions,
): Promise<ReadinessResult>;

export function registerOperationalHealthRoutes(
  app: Express,
  options?: Partial<OperationalHealthOptions>,
): void;
```

Usar uma função interna `withTimeout(check, timeoutMs)` e `Promise.allSettled` para executar os dois checks em paralelo. A rota deve construir um novo objeto sanitizado e nunca serializar o objeto `Error`.

Registrar em `server/_core/index.ts` logo após criar o Express e antes dos parsers:

```ts
const app = express();
registerOperationalHealthRoutes(app);
```

- [ ] **Step 4: Confirmar estado verde**

Run:

```bash
corepack pnpm vitest run server/_core/operationalHealth.test.ts --pool=forks --poolOptions.forks.singleFork
```

Expected: todos os testes da rota passam; liveness não chama checks e readiness devolve `503` sanitizado em qualquer falha.

- [ ] **Step 5: Verificar tipos e registrar commit**

```bash
corepack pnpm check
git diff --check
git add server/_core/operationalHealth.ts server/_core/operationalHealth.test.ts server/_core/index.ts
git commit -m "feat: adicionar contratos de saúde operacional"
```

### Task 2: Adaptadores reais de banco e armazenamento

**Files:**
- Modify: `server/_core/operationalHealth.ts`
- Modify: `server/_core/operationalHealth.test.ts`
- Modify: `server/_core/env.ts`

**Interfaces:**
- Consumes: `getDb()`, `sql`, `storageGetSignedUrl()`, `ENV.storageHealthcheckKey` e `fetch`.
- Produces: `checkDatabaseReady()`, `checkStorageReady(key?, timeoutMs?)` e defaults usados pelas rotas.

- [ ] **Step 1: Escrever testes vermelhos dos adaptadores**

Mockar banco, assinatura de URL e `fetch`. Exigir:

```ts
await expect(checkDatabaseReady()).resolves.toBeUndefined();
expect(db.execute).toHaveBeenCalledTimes(1);

await expect(checkStorageReady("health/ready.txt", 2_000)).resolves.toBeUndefined();
expect(fetchMock).toHaveBeenCalledWith(
  "https://storage.test/sentinel",
  expect.objectContaining({
    method: "GET",
    headers: { Range: "bytes=0-0" },
    signal: expect.any(AbortSignal),
  }),
);
```

Adicionar casos para banco ausente, chave vazia, URL vazia, HTTP `404`, HTTP `500`, timeout, `200` e `206`. Confirmar que nenhum teste chama `storagePut`.

- [ ] **Step 2: Confirmar estado vermelho**

```bash
corepack pnpm vitest run server/_core/operationalHealth.test.ts --pool=forks --poolOptions.forks.singleFork
```

Expected: FAIL porque os adaptadores ainda não foram exportados.

- [ ] **Step 3: Implementar check do banco**

```ts
export async function checkDatabaseReady(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  await db.execute(sql`SELECT 1`);
}
```

O erro é interno e nunca será enviado pela rota.

- [ ] **Step 4: Implementar check da sentinela**

```ts
export async function checkStorageReady(
  key = ENV.storageHealthcheckKey,
  timeoutMs = 2_000,
): Promise<void> {
  if (!key.trim()) throw new Error("storage_healthcheck_key_missing");
  const signedUrl = await storageGetSignedUrl(key.trim());
  const response = await fetch(signedUrl, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("storage_unavailable");
  }
  await response.body?.cancel().catch(() => undefined);
}
```

Adicionar em `ENV`:

```ts
storageHealthcheckKey: process.env.STORAGE_HEALTHCHECK_KEY ?? "",
```

Não tornar a variável impeditiva no `validateRuntimeEnv`: processo vivo com readiness `503` é o diagnóstico seguro durante provisionamento.

- [ ] **Step 5: Passar testes e tipos**

```bash
corepack pnpm vitest run server/_core/operationalHealth.test.ts --pool=forks --poolOptions.forks.singleFork
corepack pnpm check
```

Expected: banco e storage passam apenas nas condições documentadas; nenhuma rede real é acessada.

- [ ] **Step 6: Registrar commit**

```bash
git diff --check
git add server/_core/operationalHealth.ts server/_core/operationalHealth.test.ts server/_core/env.ts
git commit -m "feat: verificar banco e sentinela na prontidão"
```

### Task 3: Porta fixa em produção

**Files:**
- Create: `server/_core/serverPort.ts`
- Create: `server/_core/serverPort.test.ts`
- Modify: `server/_core/index.ts`

**Interfaces:**
- Consumes: valor textual de `PORT`, indicador de produção e função de disponibilidade.
- Produces: `parseServerPort(value)`, `findAvailablePort(startPort, isAvailable?)` e `selectServerPort(input)`.

- [ ] **Step 1: Escrever testes vermelhos**

```ts
expect(parseServerPort(undefined)).toBe(3000);
expect(parseServerPort("8080")).toBe(8080);
expect(() => parseServerPort("0")).toThrow("PORT");
expect(() => parseServerPort("65536")).toThrow("PORT");

await expect(selectServerPort({
  configuredPort: 3000,
  isProduction: true,
  isAvailable: vi.fn().mockResolvedValue(false),
})).resolves.toBe(3000);

await expect(selectServerPort({
  configuredPort: 3000,
  isProduction: false,
  isAvailable: vi.fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true),
})).resolves.toBe(3001);
```

Confirmar que produção não chama `isAvailable`; o próprio `listen` deve falhar se a porta estiver ocupada.

- [ ] **Step 2: Confirmar estado vermelho**

```bash
corepack pnpm vitest run server/_core/serverPort.test.ts --pool=forks --poolOptions.forks.singleFork
```

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Extrair e implementar seleção de porta**

Mover `isPortAvailable` e a busca para `serverPort.ts`. Implementar:

```ts
export async function selectServerPort(input: {
  configuredPort: number;
  isProduction: boolean;
  isAvailable?: (port: number) => Promise<boolean>;
}): Promise<number> {
  if (input.isProduction) return input.configuredPort;
  return findAvailablePort(input.configuredPort, input.isAvailable);
}
```

Em `index.ts`, substituir `parseInt` e `findAvailablePort` locais por:

```ts
const configuredPort = parseServerPort(process.env.PORT);
const port = await selectServerPort({
  configuredPort,
  isProduction: ENV.isProduction,
});
```

- [ ] **Step 4: Passar testes, tipos e regressão de saúde**

```bash
corepack pnpm vitest run server/_core/serverPort.test.ts server/_core/operationalHealth.test.ts --pool=forks --poolOptions.forks.singleFork
corepack pnpm check
```

- [ ] **Step 5: Registrar commit**

```bash
git diff --check
git add server/_core/serverPort.ts server/_core/serverPort.test.ts server/_core/index.ts
git commit -m "fix: manter porta configurada em produção"
```

### Task 4: Smoke test externo e determinístico

**Files:**
- Create: `scripts/post-deploy-smoke.mjs`
- Create: `server/postDeploySmoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SMOKE_BASE_URL`, `SMOKE_TIMEOUT_MS` e três endpoints HTTP.
- Produces: comando `pnpm smoke:post-deploy`, saída sanitizada e códigos de processo `0`/`1`.

- [ ] **Step 1: Escrever testes vermelhos do CLI**

Usar `node:http` em porta efêmera e executar o script como subprocesso com `process.execPath`. Criar helper:

```ts
async function runSmoke(env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    resolve => {
      const child = spawn(process.execPath, [scriptPath], {
        env: { ...process.env, ...env },
      });
      // Acumular stdout/stderr e resolver no evento close.
    },
  );
}
```

Cobrir sucesso completo e falhas identificadas em `liveness`, `readiness` e `homepage`. Cobrir URL ausente, protocolo diferente de HTTP(S), timeout menor que 100 ms, maior que 30.000 ms e raiz sem `text/html`.

- [ ] **Step 2: Confirmar estado vermelho**

```bash
corepack pnpm vitest run server/postDeploySmoke.test.ts --pool=forks --poolOptions.forks.singleFork
```

Expected: FAIL porque o script ainda não existe.

- [ ] **Step 3: Implementar validação de configuração**

No script:

```js
function readConfig(env = process.env) {
  const baseUrl = new URL(env.SMOKE_BASE_URL ?? "");
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('configuration: SMOKE_BASE_URL must use http or https');
  }
  const timeoutMs = Number(env.SMOKE_TIMEOUT_MS ?? 5_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('configuration: SMOKE_TIMEOUT_MS must be 100..30000');
  }
  return { baseUrl, timeoutMs };
}
```

- [ ] **Step 4: Implementar as três verificações**

Usar `new URL(path, baseUrl)` e `AbortSignal.timeout(timeoutMs)`. Validar JSON exato de saúde e `content-type` HTML da raiz. Saída esperada:

```text
[smoke] PASS liveness
[smoke] PASS readiness
[smoke] PASS homepage
[smoke] PASS all checks
```

Falha esperada:

```text
[smoke] FAIL readiness: expected HTTP 200
```

Não imprimir corpo completo, cabeçalhos, URL assinada ou variáveis de ambiente.

Adicionar ao manifesto:

```json
"smoke:post-deploy": "node scripts/post-deploy-smoke.mjs"
```

- [ ] **Step 5: Passar teste e executar ajuda negativa controlada**

```bash
corepack pnpm vitest run server/postDeploySmoke.test.ts --pool=forks --poolOptions.forks.singleFork
corepack pnpm smoke:post-deploy
```

Expected: testes passam; execução sem `SMOKE_BASE_URL` encerra com código `1` e mensagem sanitizada de configuração.

- [ ] **Step 6: Registrar commit**

```bash
git diff --check
git add scripts/post-deploy-smoke.mjs server/postDeploySmoke.test.ts package.json
git commit -m "test: adicionar smoke pós-publicação"
```

### Task 5: Documentação, decisão e versão 1.15.4

**Files:**
- Create: `docs/source-package/ROLLBACK_OPERACIONAL.md`
- Create: `docs/decisions/D004-operational-health-smoke-rollback.md`
- Modify: `docs/source-package/DEPLOY_CONTEINERIZADO.md`
- Modify: `docs/source-package/CHANGELOG.md`
- Modify: `package.json`
- Modify: `scripts/security-regression-check.mjs`

**Interfaces:**
- Consumes: contratos implementados e evidências atuais de teste.
- Produces: histórico didático, runbook sem comandos destrutivos e checkpoint semântico 1.15.4.

- [ ] **Step 1: Demonstrar proteção de versão em vermelho**

Alterar somente `package.json` para `1.15.4`, afastar qualquer `dist` anterior e executar:

```bash
corepack pnpm security:check
```

Expected: FAIL com `A versão segura esperada é 1.15.3.`

- [ ] **Step 2: Atualizar controle de versão segura**

Alterar a asserção para:

```js
requireCondition(
  packageJson.version === "1.15.4",
  "A versão segura esperada é 1.15.4.",
);
```

- [ ] **Step 3: Escrever runbook de rollback**

O documento deve conter, sem comandos que removam recursos:

- critérios que acionam rollback;
- responsáveis e evidências mínimas;
- verificação de compatibilidade de migração;
- seleção de checkpoint/artefato imutável;
- republicação pelo mecanismo autorizado;
- validação por health e smoke;
- bloqueio de rollback quando dados forem incompatíveis;
- distinção entre aplicação e restauração do D-005;
- registro de horário, versão, motivo e resultado.

- [ ] **Step 4: Corrigir documentação conteinerizada**

Adicionar aviso no início:

```md
> **Situação dos artefatos:** este documento preserva uma arquitetura de referência. `Dockerfile`, `docker-compose.yml` e `.env.container.example` não estão presentes neste pacote e não devem ser presumidos como entregues. Use somente o mecanismo de publicação efetivamente homologado.
```

Na verificação pós-publicação, documentar:

```bash
curl --fail --silent https://seu-dominio.example/health/live
curl --fail --silent https://seu-dominio.example/health/ready
SMOKE_BASE_URL=https://seu-dominio.example corepack pnpm smoke:post-deploy
```

Documentar a criação única de um objeto não vazio e a variável `STORAGE_HEALTHCHECK_KEY`, sem incluir credenciais.

- [ ] **Step 5: Registrar decisão e changelog**

Incluir situação anterior, conceito, alternativas, decisão banco+sentinela, risco de indisponibilidade total pelo bucket, testes realizados, dependências externas e retorno para D-003.

- [ ] **Step 6: Validar documentação e registrar commit**

```bash
corepack pnpm security:check
corepack pnpm check
git diff --check
git add package.json scripts/security-regression-check.mjs docs/source-package/ROLLBACK_OPERACIONAL.md docs/source-package/DEPLOY_CONTEINERIZADO.md docs/source-package/CHANGELOG.md docs/decisions/D004-operational-health-smoke-rollback.md
git commit -m "chore: registrar checkpoint 1.15.4"
```

### Task 6: Verificação final, GitHub e checkpoints

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: branch D-004 completa.
- Produces: evidência local, workflow GitHub aprovado, tag/bundle/branch de checkpoint e PR sem merge.

- [ ] **Step 1: Revisar o diff completo**

```bash
git diff --check checkpoint/d003-v1.15.3...HEAD
git diff --stat checkpoint/d003-v1.15.3...HEAD
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' '(Bearer |mysql://|STORAGE_HEALTHCHECK_KEY=.+|pull_request_target|contents: write)' .
```

Classificar ocorrências documentais e interromper se qualquer credencial real aparecer.

- [ ] **Step 2: Executar validação local completa**

Afastar `dist` anterior e executar, na ordem:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
```

Expected:

- instalação, segurança, tipos, suíte local e build passam;
- integração sem ambiente encerra antes da coleta e lista somente as quatro variáveis obrigatórias;
- avisos conhecidos de analytics e bundle continuam classificados, não ocultados.

- [ ] **Step 3: Executar smoke contra servidor controlado**

Usar o servidor efêmero dos testes, nunca produção, e confirmar as quatro linhas `PASS`. Se houver ambiente autorizado com sentinela provisionada, executar também contra `SMOKE_BASE_URL`; se não houver, registrar `ativação operacional pendente` sem marcar falha de código.

- [ ] **Step 4: Publicar branch e abrir PR**

Criar a branch remota `chore/health-readiness-rollback` a partir de `checkpoint/d003-v1.15.3`, enviar alterações por avanço normal e abrir Pull Request em rascunho para `main`. Não usar force, auto-merge ou deploy.

- [ ] **Step 5: Observar workflow real**

Exigir conclusão `success` para instalação, segurança, TypeScript, suíte local e build. Em falha, abrir os passos/logs, corrigir por novo commit e repetir; não criar checkpoint final em estado vermelho.

- [ ] **Step 6: Criar checkpoints após estado verde**

```bash
git tag -a checkpoint/d004-v1.15.4 -m "Checkpoint D-004 v1.15.4: saúde, smoke e rollback validados" HEAD
git bundle create ../dispatch-d004-v1.15.4-checkpoint.bundle checkpoint/d004-v1.15.4 checkpoint/d003-v1.15.3
git bundle verify ../dispatch-d004-v1.15.4-checkpoint.bundle
sha256sum ../dispatch-d004-v1.15.4-checkpoint.bundle
```

Criar no GitHub `checkpoint/d004-v1.15.4` apontando para o commit remoto aprovado. Confirmar que branch de trabalho e checkpoint remoto apontam para o mesmo conteúdo.

- [ ] **Step 7: Fechar histórico didático**

Entregar:

1. situação anterior;
2. problema e causa;
3. arquivos e contratos alterados;
4. explicação de liveness/readiness/smoke/rollback;
5. testes locais e GitHub;
6. riscos e avisos conhecidos;
7. dependência da sentinela e URL real;
8. checkpoints e forma de recuperação;
9. decisões adiadas para D-005/D-010;
10. próximo marco.

## Execution Stop Conditions

Interromper e informar o usuário se:

- a base deixar de apontar para o checkpoint D-003;
- testes de linha de base falharem;
- o storage atual não aceitar leitura `GET` assinada com range;
- a implementação exigir escrita/exclusão de objeto;
- aparecer migração ou mudança de contrato de dados;
- a única forma de testar exigir credencial real;
- o GitHub workflow falhar repetidamente sem causa identificada;
- qualquer ação exigir merge, deploy ou alteração de produção.

## External Activation Dependencies

Não bloqueiam implementação, testes locais ou CI:

1. criar um objeto não vazio, por exemplo `health/ready.txt`, no armazenamento do ambiente;
2. configurar `STORAGE_HEALTHCHECK_KEY` com a chave desse objeto;
3. disponibilizar uma URL HTTP(S) autorizada em `SMOKE_BASE_URL`;
4. escolher e homologar a plataforma de publicação antes de executar rollback real.
