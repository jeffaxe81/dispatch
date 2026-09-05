# D-007C Dispatch Work-Shift Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar equipes por elegibilidade de jornada antes do GIS/OSRM, preservando razões estruturadas de inelegibilidade e compatibilidade transitória com D-007A sem escala D-007B.

**Architecture:** A D-007C adiciona uma camada de domínio independente do GIS que avalia membros, consolida a decisão por equipe e produz conjuntos elegíveis/inelegíveis. Um loader/runtime server-side resolve membros, sessão D-007A e planejamento D-007B reutilizando os serviços existentes; uma nova procedure `dispatch.rankEligibleCandidates` aplica autorização/escopo, executa elegibilidade e somente então chama `rankTeamCandidates` para candidatos aprovados. `gis.rankCandidates` permanece intacto e puro.

**Tech Stack:** TypeScript, tRPC 11, Zod, Drizzle ORM/MySQL, Vitest, OSRM adapter existente.

**Spec:** `docs/superpowers/specs/2026-09-04-d007c-dispatch-work-shift-eligibility-design.md`

## Global Constraints

- Base imutável: `checkpoint/d007b-work-shift-schedules-20260904` @ `be9b63e9e62f9e28620bb1fa753b89fdef5242f5`.
- D-007B permanece imutável; reutilizar seus serviços/contratos sem alterar semântica histórica.
- Equipe elegível quando possuir pelo menos um integrante elegível.
- Elegibilidade deve ocorrer antes de qualquer chamada GIS/OSRM.
- `gis.rankCandidates` permanece compatível e sem regras de jornada.
- Usuário sem planejamento D-007B pode ser elegível via sessão D-007A ativa durante a transição.
- Falha técnica de planejamento deve ser fail-closed para o membro, nunca elegibilidade silenciosa.
- Nenhuma nova migration é prevista para D-007C.
- Nenhuma nova permissão é prevista inicialmente; usar permissão existente de despacho/leitura e escopo server-side.
- D-007D permanece fora deste plano.
- Sem merge/deploy; PR Draft até autorização explícita.
- Cada tarefa segue RED → GREEN → regressão → commit → CP quando o marco for estável.

---

## File Structure

- `shared/dispatchEligibility.ts`: códigos estáveis e tipos compartilhados de elegibilidade.
- `server/dispatchEligibilityService.ts`: domínio puro de avaliação individual/equipe; não conhece GIS, Drizzle ou tRPC.
- `server/dispatchEligibilityService.test.ts`: matriz principal de regras D-007C.
- `server/dispatchEligibilityRuntime.ts`: loader/composição server-side de membros + D-007A + D-007B.
- `server/dispatchEligibilityRuntime.test.ts`: compatibilidade legada, integração com planejamento e fail-closed.
- `server/dispatchRouter.ts`: procedure `dispatch.rankEligibleCandidates` isolada do `routers.ts` monolítico.
- `server/dispatchRouter.test.ts`: autorização, escopo, composição e garantia de não roteamento de inelegíveis.
- `server/rootRouter.ts`: composição do novo subrouter sem modificar `server/routers.ts`.
- `server/rootRouter.test.ts` ou teste D-007C dedicado: exposição da nova procedure.
- `docs/D-007C-DISPATCH-ELIGIBILITY-EVIDENCE.md`: evidência final TDD/gates/CP.
- `docs/TRPC_CONTRACT_COVERAGE.md` e gerador correspondente: incluir novo contrato tRPC.
- `todo.md`: registrar D-007C concluída e D-007D como próximo bloco.

---

### Task 1: Contratos compartilhados e domínio puro de elegibilidade

**Files:**
- Create: `shared/dispatchEligibility.ts`
- Create: `server/dispatchEligibilityService.ts`
- Create: `server/dispatchEligibilityService.test.ts`

**Interfaces:**
- Produces:
  - `DispatchEligibilityReason`
  - `DispatchMemberEligibility`
  - `DispatchTeamEligibility<TCandidate>`
  - `DispatchEligibilityInputs`
  - `evaluateDispatchTeamEligibility(...)`
  - `partitionDispatchCandidatesByEligibility(...)`
- Consumes: somente dados já resolvidos; não acessa banco, GIS ou rede.

- [ ] **Step 1: Write the failing tests**

Cobrir no RED, no mínimo:

```ts
it("mantém a equipe elegível quando ao menos um membro está elegível", () => {
  const result = evaluateDispatchTeamEligibility(candidate, [
    member({ userId: 10, eligible: true }),
    member({ userId: 11, eligible: false, reason: "SHIFT_PAUSED" }),
  ]);
  expect(result.eligible).toBe(true);
  expect(result.eligibleMembers.map(item => item.userId)).toEqual([10]);
  expect(result.ineligibleMembers[0].reason).toBe("SHIFT_PAUSED");
});

it("marca equipe sem membros elegíveis como inelegível", () => {
  const result = evaluateDispatchTeamEligibility(candidate, [
    member({ userId: 10, eligible: false, reason: "OUTSIDE_PLANNED_SHIFT" }),
  ]);
  expect(result.eligible).toBe(false);
});
```

Adicionar também validação dos nove códigos estáveis da spec.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run server/dispatchEligibilityService.test.ts`

Expected: FAIL porque contratos/serviço ainda não existem.

- [ ] **Step 3: Implement minimal shared contracts and pure service**

Implementar `shared/dispatchEligibility.ts` com union literal dos códigos:

```ts
export const DISPATCH_ELIGIBILITY_REASONS = [
  "OUTSIDE_PLANNED_SHIFT",
  "SHIFT_NOT_STARTED",
  "SHIFT_PAUSED",
  "SHIFT_ENDED",
  "DAY_OFF",
  "LEAVE",
  "NO_ACTIVE_WORK_SHIFT",
  "USER_INACTIVE",
  "NOT_TEAM_MEMBER",
] as const;
```

O serviço deve apenas separar `eligibleMembers`/`ineligibleMembers` e considerar equipe elegível quando `eligibleMembers.length > 0`.

- [ ] **Step 4: Run focused tests and regression slice**

Run:

```bash
pnpm vitest run server/dispatchEligibilityService.test.ts server/gisService.test.ts server/workShiftService.test.ts server/workShiftScheduleService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and create Task 1 checkpoint after gates**

Commit message: `feat(d007c): add dispatch eligibility domain contracts`

---

### Task 2: Resolver elegibilidade individual a partir de D-007A/B

**Files:**
- Modify: `server/dispatchEligibilityService.ts`
- Modify: `server/dispatchEligibilityService.test.ts`
- Reuse types from: `server/workShiftScheduleService.ts`, `server/workShiftDomain.ts`

**Interfaces:**
- Produces:
  - `resolveDispatchMemberEligibility(input): DispatchMemberEligibility`
- Consumes dados normalizados:
  - `active`, `isTeamMember`
  - planejamento resolvido D-007B ou `null`
  - sessão real D-007A ou `null`

- [ ] **Step 1: Add failing tests for individual states**

Criar RED para:

```ts
expect(resolveDispatchMemberEligibility(input({ active: false })).reason).toBe("USER_INACTIVE");
expect(resolveDispatchMemberEligibility(input({ isTeamMember: false })).reason).toBe("NOT_TEAM_MEMBER");
expect(resolveDispatchMemberEligibility(input({ plan: plannedWindow, session: null })).reason).toBe("SHIFT_NOT_STARTED");
expect(resolveDispatchMemberEligibility(input({ plan: plannedWindow, session: pausedSession })).reason).toBe("SHIFT_PAUSED");
expect(resolveDispatchMemberEligibility(input({ plan: outsideWindow, session: activeSession })).reason).toBe("OUTSIDE_PLANNED_SHIFT");
expect(resolveDispatchMemberEligibility(input({ plan: dayOffPlan })).reason).toBe("DAY_OFF");
expect(resolveDispatchMemberEligibility(input({ plan: leavePlan })).reason).toBe("LEAVE");
expect(resolveDispatchMemberEligibility(input({ plan: null, session: activeSession })).eligible).toBe(true);
expect(resolveDispatchMemberEligibility(input({ plan: null, session: null })).reason).toBe("NO_ACTIVE_WORK_SHIFT");
```

Também cobrir `replacement_shift`/`extra_call` válidos como elegíveis.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run server/dispatchEligibilityService.test.ts`

Expected: FAIL nos novos casos.

- [ ] **Step 3: Implement precedence exactly**

Ordem:
1. usuário inativo;
2. vínculo de equipe inválido;
3. exceção impeditiva (`DAY_OFF`, `LEAVE`);
4. planejamento existente fora da janela → `OUTSIDE_PLANNED_SHIFT`;
5. planejamento válido + ausência de sessão → `SHIFT_NOT_STARTED`;
6. sessão pausada → `SHIFT_PAUSED`;
7. sessão encerrada → `SHIFT_ENDED`;
8. planejamento válido + sessão ativa → elegível;
9. sem planejamento: sessão D-007A ativa → elegível; pausada → `SHIFT_PAUSED`; demais → `NO_ACTIVE_WORK_SHIFT`.

- [ ] **Step 4: Run D-007A/B + domain regressions**

Run:

```bash
pnpm vitest run server/dispatchEligibilityService.test.ts server/workShiftDomain.test.ts server/workShiftService.test.ts server/workShiftScheduleDomain.test.ts server/workShiftScheduleService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat(d007c): resolve member shift eligibility`

---

### Task 3: Runtime/loader server-side de membros, sessão e planejamento

**Files:**
- Create: `server/dispatchEligibilityRuntime.ts`
- Create: `server/dispatchEligibilityRuntime.test.ts`
- Reuse: `server/workShiftScheduleDbStore.ts`
- Reuse: `server/workShiftScheduleService.ts`
- Reuse: `server/db.ts` read helpers / `getDb()` pattern already used by D-007B runtime

**Interfaces:**
- Produces:
  - `loadDispatchTeamMembers(teamId)`
  - `loadDispatchMemberCurrentSession(userId)`
  - `resolveDispatchMemberPlanning(userId, instant)`
  - `evaluateDispatchCandidates(candidates, instant)`
- Consumes `CandidateTeamPoint[]` and returns `{ eligibleCandidates, ineligibleCandidates, evaluatedAt }`.

- [ ] **Step 1: Write failing runtime tests**

Testar com adapters/mocks injetáveis:
- equipe com membro D-007B planejado + sessão ativa;
- equipe com membro sem D-007B + sessão D-007A ativa;
- equipe sem membros ativos;
- falha ao resolver planejamento: membro não pode ser promovido silenciosamente a elegível;
- membros retornados pelo cliente não são aceitos como fonte; associação vem do loader.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run server/dispatchEligibilityRuntime.test.ts`

Expected: FAIL por módulo inexistente.

- [ ] **Step 3: Implement runtime with read-only dependencies**

Reutilizar `createWorkShiftScheduleService(createWorkShiftScheduleDbStore(db))` para resolver D-007B. Não duplicar algoritmo 12x36 nem precedência de exceções. Carregar a sessão D-007A atual por usuário de forma somente leitura.

A falha técnica de planejamento deve produzir erro observável/fail-closed, não fallback para sessão legada quando existe erro de resolução.

- [ ] **Step 4: Run runtime + D-007B regressions**

Run:

```bash
pnpm vitest run server/dispatchEligibilityRuntime.test.ts server/workShiftScheduleDbStore.test.ts server/workShiftScheduleService.test.ts server/workShiftCoverageService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit and checkpoint runtime**

Commit message: `feat(d007c): add dispatch eligibility runtime`

---

### Task 4: Procedure `dispatch.rankEligibleCandidates` e escopo server-side

**Files:**
- Create: `server/dispatchRouter.ts`
- Create: `server/dispatchRouter.test.ts`
- Modify: `server/rootRouter.ts`
- Test: existing root-router test or new `server/dispatch.rootRouter.test.ts`

**Interfaces:**
- Produces tRPC procedure:
  - `dispatch.rankEligibleCandidates`
- Input:

```ts
{
  incident: { latitude: number; longitude: number };
  candidates: CandidateTeamPoint[];
}
```

- Output:

```ts
{
  rankedCandidates: RankedTeamCandidate[];
  ineligibleCandidates: DispatchTeamEligibility<CandidateTeamPoint>[];
  evaluatedAt: Date;
}
```

- [ ] **Step 1: Write failing procedure tests**

Cobrir:
- exige usuário autenticado/ativo;
- exige permissão existente compatível com despacho/leitura;
- rejeita equipe fora do escopo antes do GIS;
- chama runtime de elegibilidade antes do ranking;
- envia ao `rankTeamCandidates` somente `eligibleCandidates`;
- equipe inelegível não provoca chamada ao route provider;
- falha OSRM preserva candidato elegível com `routeError`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run server/dispatchRouter.test.ts`

Expected: FAIL porque o router ainda não existe.

- [ ] **Step 3: Implement isolated router**

Usar `router`/`protectedProcedure` existente, validar escopo com helpers atuais (`assertTeamScope`/equivalente) e nunca aceitar `userId` de membros no payload.

- [ ] **Step 4: Compose into `rootRouter.ts`**

Adicionar o subrouter sem tocar em `server/routers.ts` e preservar `gis.rankCandidates` intacto.

- [ ] **Step 5: Run procedure/root/GIS regressions**

Run:

```bash
pnpm vitest run server/dispatchRouter.test.ts server/workShiftSchedules.rootRouter.test.ts server/gisService.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit and checkpoint**

Commit message: `feat(d007c): rank only work-shift eligible teams`

---

### Task 5: Contrato tRPC, evidência e regressões finais

**Files:**
- Modify: tRPC coverage generator file used by `server/trpcCoverageGenerator.test.ts`
- Modify: `server/trpcCoverageGenerator.test.ts`
- Modify: `docs/TRPC_CONTRACT_COVERAGE.md`
- Create: `docs/D-007C-DISPATCH-ELIGIBILITY-EVIDENCE.md`
- Modify: `todo.md`

**Interfaces:**
- Adds one inventoried contract: `dispatch.rankEligibleCandidates`.

- [ ] **Step 1: Write RED for coverage inventory**

Adicionar expectativa explícita para `` `dispatch.rankEligibleCandidates` `` e novo total esperado de contratos.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run server/trpcCoverageGenerator.test.ts`

Expected: FAIL porque o gerador ainda não classifica o contrato D-007C.

- [ ] **Step 3: Update generator evidence mapping**

Classificar `dispatch.rankEligibleCandidates` como cobertura direta, apontando para `server/dispatchRouter.test.ts`, `server/dispatchEligibilityService.test.ts` e `server/dispatchEligibilityRuntime.test.ts`.

- [ ] **Step 4: Materialize generated coverage snapshot and evidence**

`docs/D-007C-DISPATCH-ELIGIBILITY-EVIDENCE.md` deve registrar:
- base SHA;
- RED/GREEN commits;
- checkpoints;
- cenários 1–16;
- confirmação de zero chamadas OSRM para inelegíveis;
- D-007D fora de escopo;
- nenhum merge/deploy.

- [ ] **Step 5: Update `todo.md`**

Marcar D-007C concluída somente após gates finais e deixar D-007D como próximo bloco.

- [ ] **Step 6: Commit**

Commit message: `docs(d007c): record dispatch eligibility evidence`

---

### Task 6: Homologação final e checkpoint D-007C

**Files:**
- No new production files expected.
- Update PR body/status only after evidence is real.

**Interfaces:**
- Produces immutable branch `checkpoint/d007c-dispatch-work-shift-eligibility-20260904`.

- [ ] **Step 1: Run full quality gate**

Run via CI-equivalent:

```bash
pnpm security:check
pnpm check
pnpm test
pnpm build
```

Expected: all PASS.

- [ ] **Step 2: Confirm mandatory scenario suite**

Verificar que os 16 cenários mínimos da spec estão cobertos explicitamente e verdes.

- [ ] **Step 3: Run all four repository gates on the same SHA**

Required:
- Qualidade ✅
- GIS visual homologation ✅
- NEO external compatibility ✅
- NEO workspace visual homologation ✅

- [ ] **Step 4: Create immutable checkpoint**

Branch: `checkpoint/d007c-dispatch-work-shift-eligibility-20260904`

- [ ] **Step 5: Close temporary CI PR without merge**

The functional PR remains Draft and unmerged.

- [ ] **Step 6: Update functional PR body**

Registrar SHA final, gates, CP, ausência de migration nova, ausência de grants e apontar D-007D como próximo bloco da Release 1.0.

---

## Self-Review

- Spec coverage: todos os critérios de elegibilidade, compatibilidade D-007A, precedência D-007B, segurança, escopo, pipeline pré-GIS, falha OSRM e 16 cenários estão mapeados nas Tasks 1–6.
- Placeholder scan: não há TBD/TODO/implement-later no plano.
- Type consistency: `DispatchEligibilityReason`, `DispatchMemberEligibility`, `DispatchTeamEligibility<TCandidate>`, `evaluateDispatchCandidates` e `dispatch.rankEligibleCandidates` são os contratos estáveis usados pelas tarefas seguintes.
- Scope: D-007D e novos épicos permanecem explicitamente excluídos.
