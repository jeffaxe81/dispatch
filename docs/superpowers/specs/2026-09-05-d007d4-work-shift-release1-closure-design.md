# D-007D4 — Fechamento Administrativo e Evidências Finais da Jornada — Design

## Estado
Design aprovado em 2026-09-05. Base exclusiva: `checkpoint/d007d3-work-shift-alerts-20260904` @ `f0d3da908d2ac8a1b48d9cd76f3960e10e65591a`.

D-007D4 consolida a Release 1.0 e não introduz nova regra de negócio. Sem merge, deploy, grants automáticos ou execução de migrations em banco real.

## Objetivo
Encerrar tecnicamente o épico Controle de Jornada Release 1.0 com visão única e auditável de requisitos, contratos, permissões, migrations, testes, checkpoints, evidências e procedimento futuro de implantação/rollback.

`D-007A Histórico → D-007B Escalas/12x36 → D-007C Elegibilidade → D-007D1 Ajustes → D-007D2 Relatórios → D-007D3 Alertas → D-007D4 Consolidação`

## Invariantes
1. Sem funcionalidade operacional nova.
2. Nenhuma migration real nesta fase.
3. Nenhum grant automático.
4. Nenhum merge/deploy automático.
5. Evidência aponta para SHAs/resultados reais; nada presumido.
6. Gate obrigatório falho bloqueia conclusão.
7. Código somente se lacuna concreta for demonstrada primeiro por teste RED.
8. Fechamento técnico não equivale a produção.

## Rastreabilidade
A evidência final deve mapear `requisito → desenho → implementação → contrato/API → permissão → migration quando houver → teste → checkpoint → homologação`, cobrindo histórico/sessões, pausas, escalas/12x36, exceções, planejado x realizado, elegibilidade, filtro antes do GIS/OSRM, ajustes auditáveis, relatórios/exportação, cobertura, alertas/deduplicação e isolamento/RBAC fail-closed.

## Contratos, RBAC e migrations
Inventariar contratos tRPC realmente publicados no `rootRouter`, cobertura de testes e permissões aplicáveis. Confirmar ausência de grants automáticos. Inventariar migrations reais da Jornada, finalidade, dependências, objetos afetados, pré/pós-condições e recuperação. Não executar migrations.

## Runbook futuro
Documentar: backup/checkpoint; versão/base; janela; pré-condições do banco; ordem das migrations; validação do catálogo de permissões; smoke tests de Jornada; despacho/elegibilidade/GIS; relatórios/alertas; observabilidade; critérios de abort/rollback. O runbook é documental e não autoriza deploy.

## Regressão final
No mesmo SHA candidato registrar resultados frescos de segurança/migrations, TypeScript, suíte completa, build, inventário tRPC/evidência, GIS visual, NEO external compatibility e NEO workspace visual. Regressões explícitas devem cobrir D-007A/B/C/D1/D2/D3, principalmente elegibilidade antes do GIS e isolamento organização/unidade.

## Fechamento
Somente todos os gates verdes permitem marcar `Controle de Jornada — 100% tecnicamente concluído para Release 1.0`. Isso não significa migration aplicada, grants, merge, deploy ou produção.

## Fora de escopo
Novas regras de jornada, contingência avançada, novos dashboards/escalonamentos/automações, mudanças GIS/OSRM, folha definitiva, migrations reais, grants, merge e deploy.

## Critérios de aceite
1. matriz requisito→evidência completa;
2. contratos tRPC inventariados/testados;
3. RBAC inventariado sem grants inesperados;
4. migrations documentadas sem execução real;
5. runbook documentado;
6. regressão completa verde no mesmo SHA;
7. gates GIS/NEO verdes no mesmo SHA;
8. evidência registra SHAs/resultados reais;
9. checkpoint definitivo criado;
10. nenhum merge/deploy/alteração de banco real.