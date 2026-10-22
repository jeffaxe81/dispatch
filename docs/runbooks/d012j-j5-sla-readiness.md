# D-012J J5 — Readiness passivo de SLA (homologação)

## Escopo
O módulo `server/workflow/workflowSlaReadiness.ts` calcula um resumo sanitizado, por organização, a partir de **evidências já coletadas** do scheduler, do adapter e do read model de backlog. **Não** executa probes, cria workers, programa cron, grava dados, publica endpoints, envia notificações ou reatribui Ocorrências.

## Modos e limites
- `disabled`: resulta em `disabled`, não em `ready`; não exige dependências ligadas.
- `manual_homologation`: requer `organizationId` e `metricsOrganizationId` coincidentes, métricas agregadas, instantes UTC estritos, estados de componentes e política explícita de limiares.
- Estados `unhealthy` e `unknown`, evidência ausente ou antiga, métricas antigas, e limiares críticos resultam em `not_ready`; falhas de contrato lançam erro (fail-closed).
- `dead_letter`, leases expirados, degradação do componente, backlog/lag moderados resultam em `degraded`.
- A política não fornece limiares presumidos: operador de homologação deve justificar e registrar seus valores.
- `ready` é **somente diagnóstico deste módulo**; não autoriza GO da plataforma, configuração de scheduler, disponibilidade real de infraestrutura ou processamento externo.

## Isolamento e segurança
A chamada deve ser originada por camada autenticada que resolve o tenant no servidor. O produtor das métricas deve consultá-las com filtro de tenant **antes** da agregação. O ID de escopo é uma verificação adicional, não substitui RLS/autorização. Não entregar ao módulo contadores combinados entre organizações. Saída contém somente contadores, códigos fixos e timestamps, sem payload de notificação, token, destinatário, erro bruto ou PII.

## Gates
1. Verificar `pnpm check` e teste `workflowSlaReadiness.test.ts`.
2. Verificar workflows de Qualidade e SLA MySQL no **mesmo HEAD**, com testes + build + Docker + concorrência real em ambiente descartável.
3. Validar manualmente tenant A/B, evidência vencida, falha de adapter, backlog crítico e flag desligada.
4. Manter PR Draft até revisão; **não** conectar este resultado ao `/health/ready` global antes de aprovar contrato, RBAC e critérios de disponibilidade.
5. Não executar migração real, grants, deploy, scheduler automático, replay automático ou notificação externa nesta entrega.
