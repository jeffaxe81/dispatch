# D-007B — Evidências de Escalas Planejadas e 12x36

## 1. Base e isolamento de escopo

- Base imutável: `checkpoint/d007a-work-shift-history-20260904` @ `91c1b679d845f663e99a5fdc00d62aef603bfdae`.
- Branch funcional: `feature/d007b-work-shift-schedules`.
- PR funcional: #28, mantido em Draft e sem merge/deploy.
- A D-007B cobre planejamento de jornada, escalas fixas/12x36, associações, exceções, snapshot planejado na sessão real e cobertura planejada x realizada.
- D-007C permanece fora deste escopo: nenhuma regra de elegibilidade de jornada foi inserida no despacho, GIS, OSRM ou ranking de candidatos.
- D-007D permanece fora deste escopo: administração avançada, alertas, ajustes auditáveis e relatórios trabalhistas não foram antecipados.

## 2. Persistência e segurança de migration

A D-007B adiciona as estruturas `work_shift_schedules`, `work_shift_assignments` e `work_shift_schedule_exceptions`, além do vínculo da sessão real com o planejamento por `schedule_assignment_id`, `scheduled_start_at` e `scheduled_end_at`.

A migration `drizzle/0004_d007b_work_shift_schedules.sql` foi materializada e registrada no journal do Drizzle. Ela **não foi executada em banco real** durante esta implementação.

As permissões `work_shift_schedules.view` e `work_shift_schedules.manage` foram adicionadas somente ao catálogo `access_permissions`. Nenhum grant automático foi criado em `role_permissions`.

## 3. Contratos tRPC

O namespace `workShiftSchedules` é composto no `server/rootRouter.ts` e expõe:

- `workShiftSchedules.list` — leitura, exige `work_shift_schedules.view`;
- `workShiftSchedules.create` — mutação, exige `work_shift_schedules.manage`;
- `workShiftSchedules.assign` — mutação, exige `work_shift_schedules.manage`;
- `workShiftSchedules.addException` — mutação, exige `work_shift_schedules.manage`;
- `workShiftSchedules.resolveForUser` — leitura, exige `work_shift_schedules.view`;
- `workShiftSchedules.coverage` — leitura, exige `work_shift_schedules.view`.

O wildcard administrativo legado `*` continua compatível. O runtime de escopo opera de forma fail-closed: múltiplas organizações/unidades ambíguas não são convertidas silenciosamente em acesso amplo.

## 4. Cenários de negócio verificados

Foram cobertos por testes automatizados:

- escala fixa com timezone explícito e dias da semana;
- escala cíclica 12x36 baseada em `cycleAnchorAt`, com 720 minutos de trabalho e 2160 minutos de descanso;
- validação de configuração 12x36 inválida;
- exceções `day_off`, `replacement_shift`, `leave`, `extra_call` e `holiday_override` conforme precedência do domínio;
- rejeição de associação ativa sobreposta para o mesmo usuário com `WORK_SHIFT_ASSIGNMENT_OVERLAP`;
- validação de escopo antes da criação de associação/exceção;
- resolução do planejamento por usuário;
- snapshot do planejamento no início da sessão real;
- cálculo de atraso (`lateStartSeconds`), saída antecipada (`earlyEndSeconds`) e hora extra (`overtimeSeconds`);
- encerramento com base no snapshot persistido, sem re-resolver regras históricas;
- cobertura planejada x realizada com estados `completed`, `in_progress` e `missing_start`;
- exceções de folga removendo corretamente a expectativa de comparecimento;
- filtros de organização, unidade organizacional e equipe no endpoint de cobertura.

## 5. TDD e checkpoints intermediários

A implementação foi conduzida por ciclos RED → GREEN → regressão, com checkpoints estáveis:

- `checkpoint/d007b-task3-schedule-service-20260904` @ `fbba1eb26c88c626feac3c95be2345c61a0935c3`;
- `checkpoint/d007b-task3-schedule-db-store-20260904` @ `c19f9faef3bfc59c8351affe195b59b91404a5f4`;
- `checkpoint/d007b-task4-session-snapshot-service-20260904` @ `8470ec733133094c618ea5c967dfe5da6631cd64`;
- `checkpoint/d007b-task4-session-runtime-20260904` @ `e0531a570c739d687c59079690bb9894b77a2195`;
- `checkpoint/d007b-task5-admin-router-contracts-20260904` @ `254caf09aaea53eba878f77515395de89217ea8b`;
- `checkpoint/d007b-task5-admin-router-runtime-20260904` @ `c99b67e27f181d28b6b63f903de84ec8e2c5df05`;
- `checkpoint/d007b-task6-planned-actual-coverage-20260904` @ `a60f62ddda24a08465f936e9ef62683f9eec9ece`.

Na Task 7, o RED `04a346d58dfec27eb645032157701d23550ed802` demonstrou que o inventário anterior ignorava o router isolado da D-007B. O GREEN `e163df12211d86f4e932a15881bb03d5ef8e574c` passou a inventariar `server/routers.ts` e `server/workShiftSchedulesRouter.ts` em conjunto, preservando os contratos anteriores.

## 6. Verificação

No SHA funcional consolidado da Task 6 (`a60f62ddda24a08465f936e9ef62683f9eec9ece`) foram aprovados:

- `security:check`;
- TypeScript (`pnpm check`);
- suíte Vitest completa: 100 arquivos / 434 testes;
- build de produção;
- `Qualidade`;
- `GIS visual homologation`;
- `NEO external compatibility`;
- `NEO workspace visual homologation`.

A revisão documental final da Task 7 deve repetir os mesmos quatro workflows remotos. O checkpoint definitivo `checkpoint/d007b-work-shift-schedules-20260904` somente pode ser criado quando todos estiverem verdes no mesmo SHA final.

## 7. Exclusões explícitas

Não fazem parte da D-007B:

- filtro de candidatos do despacho por jornada, disponibilidade ou motivo de inelegibilidade — D-007C;
- alteração do ranking GIS/OSRM — D-007C;
- administração avançada de ajustes, alertas e relatórios de jornada — D-007D;
- folha de pagamento completa, biometria, eSocial ou interpretação trabalhista integral.

Esses limites preservam a separação de responsabilidades definida no desenho técnico da D-007.