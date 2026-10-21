# AXE Dispatch — antecipação de seis meses em um dia

**Data de aceleração:** 21/10/2026  
**Repositório oficial:** `jeffaxe81/dispatch`  
**Baseline de `main`:** `9147655dd115ebce5dabea169a2e02e1b0607862` (D-012H integrada)  
**Trilho ativo:** D-012I empilhada (#116, #117, #120, #121, #122, #124, #125, #126, #127, #128).

## Princípio

A antecipação comprime a **implementação, testes, documentação, checkpoints e preparação de homologação**. Ela não converte automaticamente código em produção.

Continuam exigindo gate explícito:
- merge em `main`;
- migrations em banco operacional;
- grants/permissões produtivas;
- deploy;
- scheduler automático;
- notificações externas;
- reatribuição automática;
- mutações críticas de Ocorrência;
- limpeza destrutiva de checkpoints/dados.

## Onda 1 — equivalente ao mês 1: SLA confiável e quarentena

Objetivo: fechar D-012I/I5 com concorrência, CAS, receipts, homologação MySQL e replay administrativo.

Estado já alcançado antes deste plano:
- I4 — intenções SLA duráveis/idempotentes (#121);
- I5A — lease/fencing/retry seguro (#122);
- I5B — persistência MySQL/CAS (#124);
- I5C — worker manual/preview/lease_probe (#125);
- I5D — recibos internos + auditoria transacional (#126);
- I5E — 12/12 ensaios físicos em MySQL 8.4 (#127);
- I5F — replay administrativo de DLQ em andamento (#128).

Critérios de saída:
- replay somente `dead_letter → pending`;
- tenant resolvido no servidor;
- administrador + `workflow.execute`;
- justificativa auditável;
- CAS/versionamento;
- tarefa ainda ativa;
- rollback em falha de auditoria;
- router registrado no root;
- CI Qualidade + MySQL GREEN no mesmo head.

## Onda 2 — equivalente ao mês 2: operação e UX SLA

Entregas:
1. read model SLA tenant-scoped por tarefa/intenção, sem heurística baseada na idade da Ocorrência;
2. evolução do `SlaAlertsWidget` para usar prazos congelados do Workflow;
3. filtros: situação, prazo, tipo de evento, tarefa, responsável e organização autorizada;
4. semáforo temporal derivado de `slaReminderAt/slaDueAt/slaEscalationAt`;
5. Kanban com idade por etapa e indicadores de SLA sem alteração silenciosa de prioridade;
6. ações administrativas de replay somente quando feature gate/RBAC permitirem;
7. formulários D-008 usados como gates visuais/operacionais quando exigidos pelo workflow.

Gate:
- E2E criação → triagem → despacho → tarefa → formulário → SLA → encerramento;
- operador/despachador/supervisor/agente;
- regressão visual e acessibilidade.

## Onda 3 — equivalente ao mês 3: observabilidade, resiliência e campo

Entregas:
1. métricas de lag de SLA, lease expirado, retry, DLQ, replay e receipts;
2. trilha por `correlationId`, sem token/segredo em logs;
3. health/readiness para scheduler/adapters sem tornar terceiro requisito do core;
4. alertas operacionais e diagnóstico de backlog;
5. GIS degradado quando rota/mapa externo indisponível;
6. aplicativo de campo: aceite, checklist, evidências e conflito explícito;
7. ensaio de backup/restore/rollback em ambiente separado.

Gate:
- failover/degradação;
- isolamento tenant A/B;
- falhas e reconexão;
- segurança de localização;
- carga mínima em homologação.

## Onda 4 — equivalente ao mês 4: integrações e contratos

Entregas:
1. contratos versionados para NEO, Inventário/Ativos e CRM;
2. idempotência e receipts em integrações;
3. indisponibilidade externa isolada por outbox/DLQ;
4. ownership separado: sem escrita direta em banco de outro módulo;
5. harnesses de conformidade;
6. política de retry/circuit breaker por adapter;
7. auditoria de chamadas e erros sanitizados.

Gate:
- contrato compatível;
- replay seguro;
- teste de indisponibilidade;
- sem vazamento de credencial/PII.

## Onda 5 — equivalente ao mês 5: segurança e governança de operação

Entregas:
1. revisão RBAC por operação, organização, unidade/equipe;
2. MFA/hardening de sessão conforme escopo aprovado;
3. rate limits e proteção contra abuso de endpoints administrativos;
4. segregação de duties para grants/replay/deploy;
5. evidência de auditoria para alterações críticas;
6. retenção e mascaramento de logs;
7. pentest orientado a APIs e superfícies de integração.

Gate:
- nenhum privilégio implícito;
- fail-closed;
- trilha de ator/tenant/ação;
- testes negativos multi-tenant.

## Onda 6 — equivalente ao mês 6: release candidate e GO operacional

Entregas:
1. performance/carga concorrente;
2. teste de longa duração de workers/fencing/retry;
3. matriz funcional e de segurança;
4. DR/backup/restore/rollback;
5. documentação de instalação/upgrade;
6. release candidate versionada;
7. matriz GO / GO COM RESSALVAS / NO-GO;
8. checklist separado para migration, grants e deploy.

Critérios de saída:
- CI e homologações GREEN no head candidato;
- riscos conhecidos classificados;
- rollback testado;
- sem gate administrativo executado por inferência.

## Execução concentrada de 21/10/2026

Ordem operacional para o dia:
1. fechar I5F e preservar checkpoint;
2. iniciar read model/painel SLA real;
3. conectar widget e Kanban aos dados temporais;
4. abrir trilho de observabilidade/DLQ;
5. preparar harnesses de resiliência e carga;
6. documentar integrações, segurança e release candidate.

Cada onda pode avançar em branch/PR empilhada. Nenhuma onda autoriza automaticamente integração em `main` ou produção.
