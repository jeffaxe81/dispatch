# D-007C — Elegibilidade de jornada antes do GIS/OSRM — Evidência

## Escopo e base

A D-007C parte exclusivamente de `checkpoint/d007b-work-shift-schedules-20260904` @ `be9b63e9e62f9e28620bb1fa753b89fdef5242f5` e é implementada no Draft PR #30, sem merge e sem deploy.

Objetivo: impedir que equipes sem integrante elegível pela jornada sejam consideradas pelo ranking geográfico/OSRM, preservando compatibilidade com a jornada histórica D-007A e com o GIS legado.

## Regra operacional

Uma equipe candidata é elegível quando possui ao menos um integrante elegível no instante avaliado. A associação de membros é carregada server-side e não é aceita do payload do cliente.

Razões estruturadas de inelegibilidade individual:

- `USER_INACTIVE`;
- `NOT_TEAM_MEMBER`;
- `DAY_OFF`;
- `LEAVE`;
- `OUTSIDE_PLANNED_SHIFT`;
- `SHIFT_NOT_STARTED`;
- `SHIFT_PAUSED`;
- `SHIFT_ENDED`;
- `NO_ACTIVE_WORK_SHIFT`.

Quando existe planejamento D-007B, a janela fixed/12x36 continua sendo calculada pelo serviço D-007B. `day_off` e `leave` são preservados pelo adapter para manter a razão operacional específica. Quando não existe planejamento D-007B, uma sessão ativa D-007A continua válida como fallback de compatibilidade. Falha técnica ao resolver planejamento é fail-closed e não promove silenciosamente um usuário para elegível.

## Pipeline comprovado

`dispatch.rankEligibleCandidates` executa a seguinte ordem:

1. autenticação;
2. autorização `dispatch.view`;
3. validação server-side de escopo de cada `teamId` candidato;
4. carga server-side dos membros da equipe;
5. resolução de planejamento D-007B e sessão D-007A;
6. consolidação de elegibilidade por equipe;
7. particionamento em elegíveis e inelegíveis;
8. envio **somente das equipes elegíveis** para `rankTeamCandidates`;
9. cálculo geodésico/OSRM/ETA apenas para o subconjunto elegível.

Assim, candidatos inelegíveis não geram chamadas ao provedor de rotas. Se todos os candidatos forem inelegíveis, o ranking retorna vazio e o provedor não é chamado.

## Compatibilidade GIS

O contrato legado `gis.rankCandidates` foi preservado. A D-007C acrescenta um novo caminho explícito, `dispatch.rankEligibleCandidates`, sem reescrever o comportamento do endpoint GIS legado. O novo endpoint compõe a elegibilidade antes do ranking e preserva `routeError` quando o provedor de rota falha para um candidato que chegou legitimamente à etapa GIS.

## Segurança e escopo

- permissão reutilizada: `dispatch.view`;
- nenhuma permissão RBAC nova criada;
- nenhuma migration nova criada;
- nenhuma escrita de banco introduzida pela D-007C;
- membros e vínculo de equipe são derivados server-side;
- cada equipe é validada com `assertTeamScope` antes da avaliação e antes do GIS;
- erro técnico de planejamento é fail-closed.

## Evidência por testes

Suítes D-007C:

- `server/dispatchEligibilityService.test.ts` — precedência individual e consolidação por equipe;
- `server/dispatchEligibilityRuntime.test.ts` — carga server-side, fallback D-007A e fail-closed;
- `server/dispatchEligibilityDb.test.ts` — adapter Drizzle somente leitura, sessão atual, exceções e delegação ao serviço D-007B;
- `server/dispatchRouter.test.ts` — autenticação, `dispatch.view`, escopo, ordem elegibilidade→GIS, não roteamento de inelegíveis e `routeError`;
- `server/dispatch.rootRouter.test.ts` — registro real de `dispatch.rankEligibleCandidates` no root router;
- `server/trpcCoverageGenerator.test.ts` — inventário do contrato D-007C e totais da suíte.

Regressões relacionadas:

- `server/gisService.test.ts`;
- `server/routingProvider.test.ts`;
- `server/workShiftService.test.ts`;
- `server/workShiftScheduleService.test.ts`;
- `server/workShiftCoverageService.test.ts`.

## TDD e checkpoints

- Task 1 RED `7032e8b0...`; CP `checkpoint/d007c-task1-eligibility-domain-20260904` @ `154211b34e4e955a718c643db5bf696342485661`;
- Task 2 RED `a0b6fc9a...`; CP `checkpoint/d007c-task2-member-eligibility-20260904` @ `1035615f31765c4ff688a049ae0fea0ac390507f`;
- Task 3 runtime RED `d4416ca1...`; CP núcleo `checkpoint/d007c-task3-runtime-core-20260904` @ `6fe4ecc25109fcce416436aa89a2c4aae346ff39`;
- Task 3 adapter RED `d5dfbd8476d0c5db446e08e68f0c4d85487099dd`; CP final `checkpoint/d007c-task3-runtime-db-adapter-20260904` @ `23de7a03917dea761b644c37f3bd080711dbe5dc`;
- Task 4 router RED `d9e65183508fe10171f9cc3ff0fb21daaff94f4c`; CP `checkpoint/d007c-task4-dispatch-router-20260904` @ `5c70e20b4e55e1d7f911d36e5b60640003307a68`;
- Task 5 inventário RED `d1f75f7b6a6ae6c7a94944134b1f467ffa6e3f67`; GREEN do gerador `ceb4ccce0aeeb3d846ba7af7a62bbf3dccfb7729`.

A Task 4 foi homologada no mesmo SHA `5c70e20b4e55e1d7f911d36e5b60640003307a68` pelos quatro workflows: Qualidade, GIS visual, NEO external compatibility e NEO workspace visual homologation.

## Critério de fechamento

A D-007C só será considerada definitivamente encerrada após o SHA documental consolidado passar novamente pelos quatro gates, além de segurança, TypeScript, suíte completa e build. O checkpoint final esperado é `checkpoint/d007c-dispatch-work-shift-eligibility-20260904`.

D-007D permanece explicitamente fora deste PR.