# CP-016 Dispatch Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualificar candidatos e atribuições por habilidade, região e localização recente, com decisão autoritativa no servidor.

**Architecture:** Campos opcionais e aditivos representam requisitos na ocorrência; uma unidade pura normaliza e avalia os dados concretos. Consulta e atribuição carregam dados no servidor, sendo a atribuição a verificação final sob bloqueio transacional.

**Tech Stack:** TypeScript, Drizzle ORM/MySQL 8.4, tRPC/Zod, Vitest, GitHub Actions, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-05-cp016-dispatch-qualification-design.md`

## Global Constraints

- Preservar `package.json` em `1.15.5` até decisão formal de release.
- Migration somente aditiva; não remover, renomear ou tornar obrigatório campo existente.
- Clientes antigos continuam criando ocorrências sem os novos campos.
- Decisão de elegibilidade pertence ao servidor; flags calculadas pelo cliente não são confiáveis.
- Localização recente é obrigatória; validade padrão de 300 segundos e tolerância futura de 30 segundos.
- Todas as habilidades exigidas devem existir na presença; região só restringe quando informada.
- Preservar permissões, escopo, auditoria, Draft PR e `main`.
- Cada mudança candidata exige RED, GREEN, regressão e CI do SHA remoto. Preparação pode ocorrer em paralelo, mas commit/publicação/aprovação somente após os testes pertinentes OK.
- Sem merge ou deploy nesta execução.

---

### Task 1: Contrato aditivo da ocorrência e migration

**Files:**
- Modify: `drizzle/schema.ts`
- Create: próxima migration numerada em `drizzle/`
- Modify: `drizzle/meta/_journal.json`
- Create/Modify: snapshot correspondente em `drizzle/meta/`
- Create: `server/incidentQualificationSchema.test.ts`
- Modify: `.github/workflows/cp016-mysql-integration.yml`

**Interfaces:**
- Produces: `incidents.requiredSkills: string[] | null` e `incidents.regionCode: string | null`.
- Preserves: todos os campos e dados existentes de `incidents`.

- [ ] **Step 1: escrever o teste RED do schema**

```ts
const config = getTableConfig(incidents);
expect(config.columns.find(column => column.name === "required_skills")?.notNull).toBe(false);
expect(config.columns.find(column => column.name === "region_code")?.notNull).toBe(false);
```

- [ ] **Step 2: confirmar RED**

Run: `corepack pnpm exec vitest run server/incidentQualificationSchema.test.ts`
Expected: FAIL porque as colunas não existem.

- [ ] **Step 3: adicionar os campos ao schema**

```ts
requiredSkills: json("required_skills").$type<string[] | null>(),
regionCode: varchar("region_code", { length: 80 }),
```

- [ ] **Step 4: gerar e inspecionar a migration**

Run: `DATABASE_URL=mysql://cp016:cp016@127.0.0.1:3306/dispatch_cp016_ci corepack pnpm exec drizzle-kit generate --config drizzle.config.ts`
Expected: exatamente dois `ADD`, ambos anuláveis; nenhum `DROP`, `RENAME`, `DELETE`, `UPDATE` ou alteração de obrigatoriedade.

- [ ] **Step 5: adicionar validação de upgrade com dados**

No CI descartável, criar uma ocorrência no esquema anterior, aplicar a nova migration e conferir que código, categoria e coordenadas continuam iguais e os novos campos são `NULL`.

- [ ] **Step 6: verificar GREEN**

Run: `corepack pnpm exec vitest run server/incidentQualificationSchema.test.ts && corepack pnpm check && corepack pnpm security:check`
Expected: PASS.

- [ ] **Step 7: liberar registro Git após testes OK**

```bash
git add drizzle server/incidentQualificationSchema.test.ts .github/workflows/cp016-mysql-integration.yml
git commit -m "feat(CP-016): add incident qualification fields"
```

---

### Task 2: Normalização e avaliação pura

**Files:**
- Modify: `server/dispatchEligibility.ts`
- Modify: `server/dispatchEligibility.test.ts`

**Interfaces:**
- Produces: `normalizeQualificationCode(value: string): string`.
- Produces: `normalizeRequiredSkills(values?: string[] | null): string[]`.
- Produces: `isFreshTeamLocation(input): boolean`.
- Evolves: `evaluateDispatchEligibility` para consumir requisitos e dados concretos, mantendo `DispatchEligibilityResult` e a ordem determinística das razões.

- [ ] **Step 1: escrever testes RED de normalização**

```ts
expect(normalizeQualificationCode("  RESGATE-ALTURA ")).toBe("resgate-altura");
expect(normalizeRequiredSkills(["resgate", " RESGATE ", "eletrica"])).toEqual(["resgate", "eletrica"]);
expect(() => normalizeQualificationCode("manutenção")).toThrow(/código/i);
```

- [ ] **Step 2: escrever testes RED de localização**

```ts
const now = new Date("2026-09-05T12:00:00Z");
expect(isFreshTeamLocation({ latitude: -27, longitude: -48, capturedAt: new Date("2026-09-05T11:55:00Z"), now, freshnessSeconds: 300 })).toBe(true);
expect(isFreshTeamLocation({ latitude: -27, longitude: -48, capturedAt: new Date("2026-09-05T11:54:59Z"), now, freshnessSeconds: 300 })).toBe(false);
expect(isFreshTeamLocation({ latitude: -27, longitude: -48, capturedAt: new Date("2026-09-05T12:00:31Z"), now, freshnessSeconds: 300 })).toBe(false);
```

- [ ] **Step 3: escrever testes RED de habilidades/região**

Usar valores literais para provar: todas presentes; uma ausente; requisitos vazios; região igual; diferente; não exigida. Cada falha deve produzir `skill_not_allowed`, `region_not_allowed` ou `stale_location` na posição documentada.

- [ ] **Step 4: confirmar RED**

Run: `corepack pnpm exec vitest run server/dispatchEligibility.test.ts`
Expected: FAIL por exports/contrato ainda inexistentes.

- [ ] **Step 5: implementar o mínimo**

```ts
const QUALIFICATION_CODE = /^[a-z0-9._-]{1,80}$/;
const normalized = value.trim().toLowerCase();
if (!QUALIFICATION_CODE.test(normalized)) throw new Error("Código de qualificação inválido.");
```

Calcular `skillAllowed` por `requiredSkills.every(skill => candidateSkills.includes(skill))`, `regionAllowed` por ausência de requisito ou igualdade e `hasFreshLocation` usando coordenadas, idade, limite e tolerância futura.

- [ ] **Step 6: verificar GREEN e mutações**

Run: `corepack pnpm exec vitest run server/dispatchEligibility.test.ts`
Expected: PASS; alterar mentalmente `every` para `some`, 300 para 301 e tolerância 30 para 31 deve quebrar ao menos um teste.

- [ ] **Step 7: liberar registro Git após testes OK**

```bash
git add server/dispatchEligibility.ts server/dispatchEligibility.test.ts
git commit -m "feat(CP-016): evaluate concrete dispatch qualifications"
```

---

### Task 3: Configuração segura da validade

**Files:**
- Modify: `server/db.ts`
- Create: `server/dispatchSettings.test.ts`

**Interfaces:**
- Produces: `getDispatchLocationFreshnessSeconds(dbOrTx): Promise<number>`.
- Reads: entrada ativa `dispatch/locationFreshnessSeconds` em `general_setting_entries`.
- Returns: 300 somente quando a entrada não existe; tipo ou faixa inválidos geram erro explícito.

- [ ] **Step 1: escrever testes RED**

Cobrir ausência → 300; `30` e `86400` aceitos; `29`, `86401`, decimal, string, boolean e entrada inativa rejeitados ou tratados conforme o contrato (entrada inativa equivale a ausente).

- [ ] **Step 2: confirmar RED**

Run: `corepack pnpm exec vitest run server/dispatchSettings.test.ts`
Expected: FAIL porque o leitor não existe.

- [ ] **Step 3: implementar consulta e validação**

```ts
const DEFAULT_LOCATION_FRESHNESS_SECONDS = 300;
if (row === undefined) return DEFAULT_LOCATION_FRESHNESS_SECONDS;
if (!Number.isInteger(row.value) || row.value < 30 || row.value > 86_400) {
  throw new Error("Configuração de validade da localização inválida.");
}
return row.value;
```

- [ ] **Step 4: verificar GREEN**

Run: `corepack pnpm exec vitest run server/dispatchSettings.test.ts && corepack pnpm check`
Expected: PASS.

- [ ] **Step 5: liberar registro Git após testes OK**

```bash
git add server/db.ts server/dispatchSettings.test.ts
git commit -m "feat(CP-016): read dispatch location freshness setting"
```

---

### Task 4: Criação e atualização compatíveis de ocorrência

**Files:**
- Modify: `server/db.ts`
- Modify: `server/routers.ts`
- Modify: `server/incidentLifecycle.router.test.ts`
- Create: `server/incidentQualification.integration.test.ts`

**Interfaces:**
- Extends: `createIncident` e `updateIncident` com `requiredSkills?: string[] | null` e `regionCode?: string | null`.
- Extends: schemas Zod de `incidents.create` e `incidents.update`.
- Preserves: payloads antigos sem os novos campos.

- [ ] **Step 1: escrever testes RED de API**

```ts
await caller.incidents.create({ ...baseIncident, requiredSkills: ["eletrica", "resgate"], regionCode: "norte" });
expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({ requiredSkills: ["eletrica", "resgate"], regionCode: "norte" }));
```

Adicionar caso antigo sem campos e rejeições para código inválido, duplicatas normalizadas e mais de 50 habilidades.

- [ ] **Step 2: confirmar RED**

Run: `corepack pnpm exec vitest run server/incidentLifecycle.router.test.ts server/incidentQualification.integration.test.ts`
Expected: FAIL porque API/persistência ainda ignoram os requisitos.

- [ ] **Step 3: implementar persistência normalizada**

Normalizar antes da transação; gravar `null` para lista vazia e região ausente; incluir os campos no snapshot de auditoria para criação/alteração.

- [ ] **Step 4: verificar GREEN e compatibilidade**

Run: `corepack pnpm exec vitest run server/incidentLifecycle.router.test.ts server/incidentQualification.integration.test.ts && corepack pnpm check`
Expected: PASS para payload novo e legado.

- [ ] **Step 5: liberar registro Git após testes OK**

```bash
git add server/db.ts server/routers.ts server/incidentLifecycle.router.test.ts server/incidentQualification.integration.test.ts
git commit -m "feat(CP-016): persist incident dispatch requirements"
```

---

### Task 5: Consulta autoritativa de candidatos

**Files:**
- Modify: `server/db.ts`
- Modify: `server/routers.ts`
- Create: `server/dispatchCandidates.integration.test.ts`
- Modify: `server/incidentLifecycle.router.test.ts`

**Interfaces:**
- Produces: `listEligibleDispatchCandidates(input: { incidentId: number; actorUserId: number }): Promise<...>`.
- Produces: `incidents.eligibleCandidates({ incidentId })`.
- Consumes: `evaluateDispatchEligibility`, validade configurada, escopo real, presença mais recente e snapshot de localização.

- [ ] **Step 1: escrever testes RED no MySQL**

Criar uma ocorrência e equipes literais: elegível; habilidade ausente; região divergente; localização expirada; fora do escopo. Esperar somente a equipe elegível e verificar que a resposta contém posição real necessária ao ranqueamento.

- [ ] **Step 2: escrever teste RED da rota**

Provar que a rota recebe apenas `incidentId`, aplica `occurrences.view` e não aceita `scopeAllowed`, `skillAllowed`, `regionAllowed` ou `hasFreshLocation` do cliente.

- [ ] **Step 3: confirmar RED**

Run: `corepack pnpm exec vitest run server/dispatchCandidates.integration.test.ts server/incidentLifecycle.router.test.ts`
Expected: FAIL porque consulta/procedure não existem.

- [ ] **Step 4: implementar consulta**

Carregar requisitos e `now` uma vez, recuperar a presença mais recente por equipe, calcular escopo no servidor e filtrar com a unidade pura. Não chamar OSRM nesta função; retornar pontos elegíveis para o serviço geográfico existente.

- [ ] **Step 5: verificar GREEN**

Run: `corepack pnpm exec vitest run server/dispatchCandidates.integration.test.ts server/incidentLifecycle.router.test.ts && corepack pnpm check`
Expected: PASS.

- [ ] **Step 6: liberar registro Git após testes OK**

```bash
git add server/db.ts server/routers.ts server/dispatchCandidates.integration.test.ts server/incidentLifecycle.router.test.ts
git commit -m "feat(CP-016): list server-authorized dispatch candidates"
```

---

### Task 6: Verificação final na atribuição transacional

**Files:**
- Modify: `server/db.ts`
- Modify: `server/dispatchEligibility.integration.test.ts`

**Interfaces:**
- Extends: `assignTeamToIncident` para habilidade, região e localização sob os bloqueios já existentes.
- Preserves: sucesso atômico e mudança de presença para `busy`.

- [ ] **Step 1: escrever testes RED de contorno**

No MySQL, chamar `assignTeamToIncident` diretamente para equipe com jornada/presença disponíveis, mas com: habilidade ausente; região divergente; localização expirada; localização futura; configuração inválida. Em todos, esperar erro e ocorrência/atribuição/evento/auditoria inalterados.

- [ ] **Step 2: escrever teste RED de mudança concorrente**

Executar listagem elegível, tornar a localização expirada ou presença indisponível antes da atribuição e provar que a verificação final rejeita. Manter o teste já existente de duas ocorrências disputando a mesma equipe.

- [ ] **Step 3: confirmar RED**

Run no CI MySQL: `corepack pnpm exec vitest run --config vitest.integration.config.ts server/dispatchEligibility.integration.test.ts`
Expected: FAIL porque a atribuição ainda valida apenas jornada/presença.

- [ ] **Step 4: implementar a verificação final**

Sob bloqueio de ocorrência/equipe, carregar presença mais recente, sessão, configuração e requisitos da ocorrência; avaliar dados concretos. Se `eligible=false`, lançar `Equipe não elegível para despacho.` antes de qualquer INSERT/UPDATE.

- [ ] **Step 5: verificar GREEN focado**

Run no CI MySQL: `corepack pnpm exec vitest run --config vitest.integration.config.ts server/dispatchEligibility.integration.test.ts`
Expected: PASS, incluindo ausência de efeitos parciais.

- [ ] **Step 6: executar gates completos na ordem correta**

```bash
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Depois, no MySQL 8.4 descartável, aplicar migrations e executar todas as suítes de integração. Segurança ocorre antes do build porque `dist/index.js` deve estar ausente.

- [ ] **Step 7: revisar e liberar registro Git somente após tudo OK**

```bash
git add server/db.ts server/dispatchEligibility.integration.test.ts
git commit -m "feat(CP-016): enforce full dispatch qualification"
```

- [ ] **Step 8: conferir candidato remoto**

Comparar conteúdo publicado com a árvore testada, verificar SHA remoto, dois CIs verdes e manter Draft. Registrar limitações: sem tela administrativa, geofencing, catálogo ou teste de carga distribuído.

## Self-review

- Cobertura da especificação: schema aditivo (Task 1), normalização/localização (Task 2), configuração (Task 3), persistência compatível (Task 4), consulta autoritativa (Task 5), atribuição/concorrência/gates (Task 6).
- Nenhum catálogo, geofencing, nova tela, deploy ou mudança de versão foi incluído.
- Tipos consistentes: `requiredSkills: string[] | null`, `regionCode: string | null`, `locationFreshnessSeconds: number`.
- Aprovação permanece associada ao SHA final testado; qualquer mudança posterior exige revalidação.
