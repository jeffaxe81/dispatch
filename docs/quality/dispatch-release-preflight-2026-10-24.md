# AXE Dispatch — controle passivo de homologação

Preparação em 24/10/2026. Este controle é apenas diagnóstico; não faz merge, deploy, migração, grants ou probes externos.

## Uso

Executar localmente: corepack pnpm readiness:dispatch.

O comando lê o manifesto docs/quality/real-environment-pending-2026-10-23.json e imprime JSON sanitizado, com quantidades, IDs dos gates ainda pendentes e códigos fixos de erro. Não imprime nomes de usuários, URLs de evidências, credenciais ou dados de integrações.

## Pendências reais obrigatórias

- DISPATCH-REAL-01: validar MySQL de homologação, concorrência SLA, outbox/DLQ, leases com fencing, failover e rollback.
- DISPATCH-REAL-02: validar NEO, CRM e Inventário em homologação com credenciais mínimas, tenant A/B, correlação, idempotência e fail-closed. Detalhes: https://github.com/jeffaxe81/dispatch/issues/97
- DISPATCH-REAL-03: validar RBAC, isolamento de empresas, GIS, carga, reinício e ensaio restore/rollback.

Um gate só conta como evidenciado se tiver status PASSED_REAL_ENVIRONMENT, responsável humano identificado, horário UTC válido/não futuro e URL HTTPS de evidência. Qualquer falha estrutural, política enfraquecida, dados ausentes ou prova incompleta conserva NO_GO.

Quando todos os três gates estiverem evidenciados, a saída muda somente para MANUAL_GO_REVIEW_REQUIRED. Isso nunca é autorização automática: a decisão GO/NO-GO exige revisão humana, confirmação da autenticidade dos artefatos e aprovação operacional explícita. A saída production_approved permanece false e ci_not_assessed permanece true.

## Rastreabilidade

- CI técnica consolidada: https://github.com/jeffaxe81/dispatch/pull/189
- Homologação operacional do Inventário: https://github.com/jeffaxe81/dispatch/issues/89
- Environment de homologação: https://github.com/jeffaxe81/dispatch/issues/97
- Manifesto: docs/quality/real-environment-pending-2026-10-23.json

Não marque um gate como concluído sem execução real e evidência verificável. Nenhum gate substitui os testes de segurança, TypeScript, build e Docker, ou autoriza produção.
