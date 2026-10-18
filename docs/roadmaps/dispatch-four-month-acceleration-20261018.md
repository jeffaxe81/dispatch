# AXE Dispatch — antecipação de quatro meses (18/10/2026–18/02/2027)

**Repositório oficial:** `jeffaxe81/dispatch`. `dispatch-v2` não é a base de desenvolvimento.
**Baseline funcional:** 2.19.0-rc.1; D-012H integrada; D-012I com dependências empilhadas (#116, #117, #120 e #121). A PR #121 permanece Draft.
**Regra operacional:** toda entrega pode avançar em branch/PR, mas não é sinônimo de produção pronta. Merge, migration real, novos grants, disparo de notificações e deploy produtivo seguem gates explícitos. Nenhum componente pode alterar automaticamente estado crítico de Ocorrência sem decisão de domínio aprovada.

## Entrega adiantada já iniciada — I5A (branch deste plano)

- Contrato puro para `pending → leased → delivered / pending / dead_letter`.
- Lease com expiracão e renovação, `leaseToken` e fencing por `version`; isolamento multi-tenant.
- Retry exponencial com limite, motivo de falha controlado, rejeição permanente e quarentena.
- Suíte de regressão para concorrência, retries, expiração de lease, recibo obsoleto, tenant cruzado, UTC e falha permanente.
- **Ainda não existe worker real, persistência CAS, envio externo nem migration desta etapa.** Não afirmar entrega de mensagem a partir de `pending`, `leased` ou apenas da decisão pura.

## Mês 1 — 18/10 a 17/11/2026: Workflow SLA operacional seguro

1. **I5A** — máquina de estados pura e testes (branch/PR; sem infraestrutura).
2. **I5B** — schema, migration 0016, adaptador Drizzle e testes em PR Draft (CI e migração real pendentes): repositório de leases com `UPDATE ... WHERE version = ? AND organization_id = ?`, retorno de affected rows e transação. Impedir claims simultâneos e status incompatíveis.
3. **I5C** — código inicial em PR Draft: consulta de fila por tenant/tarefa ativa, preview somente leitura, lease_probe limitado a 20 e desabilitado por padrão; checkpoint pela persistência de lease. Homologação MySQL real, replay administrativo de DLQ e worker automático permanecem pendentes.
4. **I5D** — adapters de notificação idempotentes, `eventKey` de deduplicação de ponta a ponta, trilhas e alertas. Nenhum escalonamento automático de tarefa sem validação da regra de negócio.
5. **Gate:** 100% dos fluxos críticos de concorrência, tenant e idempotência em teste; evidência externa da integração antes do GO.

## Mês 2 — 18/11 a 17/12/2026: Operação e UX do despacho

1. Painel SLA com fila de tarefas, vencimentos, pendências, semáforos e filtros por organização/perfil.
2. Triagem Kanban com indicadores de tempo por etapa, prioridade auditável e ações rastreáveis.
3. Formulários D-008 como gates operacionais, apresentação de evidências mínimas e tratamento de submissão corrigida.
4. Jornada 12x36 e escalas com avisos para lacunas de cobertura; supervisão sem reatribuição silenciosa.
5. **Gate:** E2E criação → triagem → despacho → atendimento → encerramento; perfis operador, despachador e agente de campo; teste de acessibilidade e regressão visual.

## Mês 3 — 18/12/2026 a 17/01/2027: Resiliência, campo e georreferenciamento

1. Observabilidade D-011: health, lag de filas, falhas de adapter, DLQ, trilhas por `correlationId`, alarmes sem dados sensíveis.
2. GIS D-005: atualização controlada de localização de viaturas/equipes e degradação quando o mapa/serviço externo estiver indisponível.
3. Interface responsiva para agente de campo: aceite de tarefa, checklists e evidências autorizadas; operações offline somente com fila local, autenticação/expiração, conflitos explícitos e consentimento do usuário.
4. Plano de backup/restore e ensaio de rollback em ambiente separado, sem alterar bases produtivas.
5. **Gate:** testes de falha/reconexão, auditoria, tenant A/B e segurança de localização; carga mínima em homologação.

## Mês 4 — 18/01 a 18/02/2027: Integrações e release candidata

1. Revisão de contratos REST e eventos versionados para Motor de Ativos/Inventário, CRM e NEO Interact, com ownership separado e sem escrita direta entre bancos.
2. Harnesses de conformidade e idempotência; indisponibilidade de terceiros não interrompe o núcleo do despacho.
3. Hardening RBAC/MFA/segregação organizacional, auditoria e segurança de API.
4. Teste real de carga, desempenho, multitenancy, acessibilidade e execução operacional por perfis.
5. Release candidata e matriz GO / GO COM RESSALVAS / NO-GO, com evidências, inventário de riscos, runbook e rollback. **Produção não é aprovada implicitamente.**

## Dependências e gates de integração

- Sequência de revisão: D-012H (já integrada) → #116/#117/#120 → #121 (registro durável) → I5A (este trabalho) → I5B/I5C/I5D.
- O contrato de I5A exige que a camada futura de persistência faça **CAS atômico** por `intentId`, `organizationId` e `version`. A máquina em memória não fornece locking distribuído.
- Todo envio externo deverá portar chave idempotente e receipt; o sistema opera com possibilidade de entrega ao menos uma vez, nunca prometendo exactly-once sem confirmação do destino.
- Migrações devem ser aditivas, validadas em ambiente descartável e acompanhadas por procedimento de rollback.
- Nunca executar emissão real de alertas, notificações externas, reatribuição automática ou mutação de ocorrência com base apenas na validação de unit tests.
- `main` e ambientes produtivos permanecem intactos até revisão, CI GREEN e autorização explícita.

## Comandos de validação no clone com dependências

```bash
corepack pnpm check
corepack pnpm exec vitest run --config vitest.config.ts server/workflow/workflowSlaDeliveryState.test.ts
corepack pnpm test:all
corepack pnpm security:check
corepack pnpm build
```

**Estado da execução nesta branch:** código e testes publicados para revisão. Os comandos acima **não foram executados neste ambiente**; o status CI deve ser consultado no SHA da PR.

## I5B — Gate da migração e do CAS (18/10/2026)

A migração `0016_d012i_workflow_sla_delivery_cas.sql` é **aditiva em colunas e índice**, mas altera o enum de status para admitir `leased` e `dead_letter`. Avaliar janela de DDL e bloqueio de metadados em cópia de homologação, dimensionar o tempo da alteração e documentar reversão de aplicação. **Não executar automaticamente nem em produção.**

- Aplicação planejada somente após `0014` e `0015` no ambiente autorizado; verificar cópia de segurança e prontidão de rollback.
- Após DDL de teste, validar registros `pending` pré-existentes com `delivery_version=0` e `delivery_attempts=0`.
- Ensaiar duas tentativas de `claim` simultâneas em conexões físicas distintas, esperando exatamente uma atualização CAS; a segunda deve receber conflito de versão.
- Executar negativa tenant A/B, metadados congelados, expiração de reserva, controle UTC em epoch-milliseconds, perdas de conexão e rollback de transação.
- Não executar `claim` por agendamento, nem disponibilizar endpoint ou worker neste ciclo.
- **Limite de confirmação:** o registro `delivered` só poderá ser usado no futuro com evidência de confirmação do adapter externo; o banco sozinho não confirma entrega ponta a ponta.
- Migração revertida somente após avaliação de risco: nunca remover colunas com dados `leased`, `dead_letter` ou receipts. Reversão operacional preferida: desligar o futuro worker e restaurar o release anterior após verificação da compatibilidade do schema.

## I5C — Worker manual (18/10/2026)

A microentrega I5C inicia o fluxo de descoberta e reserva manual de SLA, **sem notificações, confirmação de entrega ou atualização de Ocorrências**. A implementação não registra timer, cron, HTTP route ou CLI. Apenas chamadas internas explicitamente autorizadas em ambiente de homologação podem usar o adaptador.

- Flags obrigatórias: `AXE_RUNTIME_ENV=homologation` e `AXE_SLA_I5C_ENABLED=true`. Padrão: desligado.
- Modo `preview`: somente leitura da fila; filtra organização no ledger e no vínculo da execução, aceita tarefas `open/in_progress`, exige versão/nó congelados, verifica SLA vencido e política de tentativa.
- Modo `lease_probe`: grava exclusivamente a reserva de lease via CAS, sem emitir evento ou marcar como entregue. Usar apenas dados descartáveis de homologação; a reserva expira e o contador de tentativas pode chegar a quarentena.
- Limite por execução: 20 intents; horário UTC obtido do servidor no ponto de entrada MySQL; conflitos CAS de outras tentativas são contabilizados.
- Registro de execução e critérios de validação: `docs/runbooks/d012i-i5c-manual-worker.md`.
- **Gates ainda não comprovados:** CI nesta PR, MySQL real com duas conexões, migrações em homologação, autenticação operacional no futuro ponto de entrada e corrida de encerramento de tarefa entre listagem e claim.
- Reprocessamento da DLQ e envio idempotente ficam para I5D e dependem de aprovação técnica específica.
