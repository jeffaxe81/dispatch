# D-012J J6 — Supervisão SLA segura no workspace

## Escopo
- O widget existente **Alertas e SLA** exibe um resumo do recorte retornado pelo endpoint workflowSlaOperational.list (até 100 linhas), com classificação de pending, leased, dead_letter e due. **Não são totais globais**: a consulta é limitada e os filtros client-side podem reduzir o recorte.
- O endpoint workflowSlaOperational.diagnostic aceita apenas input vazio e exige autenticação, permissão workflow_tasks.view, tenant ativo resolvido no servidor e relógio do servidor.
- O endpoint invoca o avaliador J5 no modo disabled. Não existem ainda sondas verificadas de scheduler/adapters nem snapshot completo de backlog com leases/retries. Não extrapolar de dados parciais ou anunciar GO.
- O widget só é listado para quem dispõe de workflow_tasks.view, alinhado ao controle da API.
- Erro, ausência ou estado desconhecido é exibido como **diagnóstico indisponível**, não como saudável.

## Gates
1. CI Qualidade: TypeScript, testes, segurança, build e Docker.
2. CI SLA MySQL: concorrência e transações reais em MySQL 8.4 descartável.
3. Validar em homologação: RBAC, usuário inativo, tentativa de tenant via cliente, recorte filtrado e falhas de consulta.
4. Não conectar ainda o diagnóstico ao /health/ready global.
5. Para ativar J5: criar coleta de métricas **completa** e tenant-scoped, probes reais e política operacional autorizada.

Somente leitura. Sem alteração de tarefa, migration, grants, cron, disparos externos, reprocessamento automático ou deploy. PR Draft até revisão.
