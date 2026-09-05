# D-007D4 — Fechamento Administrativo e Evidências Finais da Jornada — Design

## Estado

Design aprovado funcionalmente em 2026-09-05. Esta especificação parte exclusivamente do checkpoint homologado D-007D3 `checkpoint/d007d3-work-shift-alerts-20260904` @ `f0d3da908d2ac8a1b48d9cd76f3960e10e65591a`.

D-007D4 é um bloco de consolidação da Release 1.0. Não introduz nova regra de negócio de jornada e não substitui D-007A/B/C ou D-007D1/2/3.

Sem merge, deploy, grants automáticos ou execução de migrations em banco real nesta etapa.

## Objetivo

Encerrar tecnicamente o épico Controle de Jornada da Release 1.0 com uma visão única e auditável de requisitos, contratos, permissões, migrations, testes, checkpoints, evidências, dependências e procedimentos futuros de implantação/rollback.

Cadeia consolidada:

`D-007A Histórico → D-007B Escalas/12x36 → D-007C Elegibilidade → D-007D1 Ajustes → D-007D2 Relatórios → D-007D3 Alertas → D-007D4 Consolidação/Encerramento`

## Princípios invariantes

1. D-007D4 não adiciona funcionalidades operacionais novas.
2. Nenhuma migration é executada em banco real durante o fechamento.
3. Nenhuma permissão catalogada é concedida automaticamente.
4. Nenhum PR funcional é merged automaticamente.
5. Nenhum deploy é executado nesta fase.
6. Evidência final deve apontar para SHAs e resultados reais; números não podem ser presumidos.
7. Falha em qualquer gate obrigatório impede declarar a Jornada Release 1.0 tecnicamente encerrada.
8. A cadeia histórica dos checkpoints D-007A/B/C/D1/D2/D3 permanece preservada.
9. Implantação futura deve possuir procedimento explícito de pré-check, migration, validação e rollback.
10. Fechamento técnico não equivale a entrada em produção.

## Matriz final de rastreabilidade

A evidência consolidada deve mapear, no mínimo:

`requisito → desenho → implementação → contrato/API → permissão → migration (quando houver) → teste → checkpoint → gate de homologação`

A matriz deve cobrir:
- histórico real e sessões de jornada;
- pausas/intervalos e eventos históricos;
- escalas fixas e 12x36;
- exceções de escala;
- planejamento x realizado;
- elegibilidade individual e por equipe;
- filtro antes do GIS/OSRM;
- ajustes auditáveis request/approve/reject;
- relatórios e exportação;
- cobertura;
- alertas, deduplicação, reconhecimento e resolução;
- isolamento organizacional/unidade;
- RBAC e comportamento fail-closed.

## Inventário de contratos e permissões

D-007D4 deve produzir/validar inventário final dos contratos tRPC relacionados à Jornada e sua publicação real no `rootRouter`.

Cada contrato deve possuir classificação de cobertura de teste e permissão aplicável. O fechamento deve confirmar que permissões adicionadas pelas etapas D-007A/B/D1/D2/D3 permanecem apenas catalogadas quando ainda não houver decisão explícita de grant.

A ausência de contrato, teste, permissão ou evidência esperada é falha de fechamento, não item a ser silenciosamente ignorado.

## Inventário de migrations

A consolidação deve identificar a sequência real de migrations da Jornada existente no checkpoint D-007D3, incluindo pelo menos as migrations D-007B, D-007D1, D-007D2 e D-007D3 já versionadas.

O documento final deve registrar para cada migration:
- arquivo e finalidade;
- dependências;
- tabelas/índices/permissões afetados;
- pré-condições;
- validação pós-aplicação;
- estratégia de rollback/recuperação quando tecnicamente aplicável.

D-007D4 não executa essas migrations.

## Procedimento futuro de implantação

A evidência deve incluir runbook de implantação futura, separado da execução atual:

1. confirmar backup/checkpoint e janela de mudança;
2. confirmar versão/base esperada;
3. validar pré-condições de banco;
4. aplicar migrations na ordem documentada em ambiente controlado;
5. validar catálogo de permissões sem grants inesperados;
6. executar smoke tests de Jornada;
7. validar despacho/elegibilidade/GIS;
8. validar relatórios e alertas;
9. observar métricas/logs/auditoria;
10. acionar rollback/recuperação se qualquer critério crítico falhar.

O runbook é documental nesta fase; não autoriza deploy.

## Regressão final obrigatória

A homologação final deve ser executada em um único SHA candidato e registrar resultados frescos para:
- segurança/migrations;
- TypeScript;
- suíte completa de testes;
- build;
- inventário tRPC/evidência;
- GIS visual homologation;
- NEO external compatibility;
- NEO workspace visual homologation.

Além dos gates automáticos, devem existir testes/regressões explícitos da cadeia D-007A/B/C/D1/D2/D3, com atenção especial ao filtro de elegibilidade antes do GIS e ao isolamento por organização/unidade.

## Evidência final

Criar evidência consolidada da Jornada Release 1.0, contendo:
- objetivo e escopo;
- cadeia de checkpoints e SHAs;
- matriz de rastreabilidade;
- inventário de APIs/contratos;
- inventário RBAC;
- inventário de migrations;
- matriz de testes;
- resultados dos gates no SHA final;
- riscos residuais;
- itens explicitamente fora de escopo;
- runbook futuro de implantação/rollback;
- declaração inequívoca de que migrations reais, merge e deploy não ocorreram nesta fase.

## Atualização de status do projeto

Somente após todos os gates verdes no mesmo SHA, o `todo.md`/documentação de status poderá marcar o épico Controle de Jornada como `100% tecnicamente concluído para Release 1.0`.

Essa marcação significa:
- implementação versionada;
- testes/homologação concluídos;
- evidência consolidada;
- checkpoint final criado.

Ela não significa:
- migration aplicada em produção;
- grants de permissões realizados;
- PRs merged;
- deploy realizado;
- operação produtiva ativada.

## Checkpoint definitivo

Após verificação fresca e somente se todos os critérios forem satisfeitos, criar um checkpoint imutável dedicado ao fechamento da Jornada Release 1.0 apontando para o SHA homologado. O nome exato será definido no plano de implementação seguindo o padrão existente do repositório.

## Fora do escopo

- novas regras de jornada;
- contingência operacional avançada;
- novos dashboards operacionais;
- novos mecanismos de escalonamento além do D-007D3;
- automação de cobertura/convocação;
- mudanças no ranking GIS/OSRM;
- folha de pagamento ou cálculo trabalhista definitivo;
- aplicação de migrations reais;
- grants automáticos;
- merge/deploy.

## Critérios de aceite

D-007D4 somente está concluído quando:
1. a matriz requisito→evidência está completa;
2. contratos tRPC de Jornada estão inventariados e testados;
3. RBAC está inventariado sem grants automáticos inesperados;
4. migrations estão inventariadas e documentadas, sem execução real;
5. runbook de implantação/rollback está documentado;
6. regressão completa está verde no mesmo SHA;
7. gates GIS/NEO aplicáveis estão verdes no mesmo SHA;
8. evidência final registra SHAs/resultados reais;
9. checkpoint definitivo da Jornada Release 1.0 foi criado;
10. não ocorreu merge, deploy ou alteração de banco real.

## Próxima etapa após aprovação documental

Produzir plano de fechamento D-007D4 em tarefas pequenas e verificáveis. Como o bloco é predominantemente documental/auditável, qualquer alteração de código somente será permitida se uma lacuna real for demonstrada por teste RED durante a execução; nesse caso, a lacuna deve ser tratada explicitamente, sem ampliar silenciosamente o escopo do D-007D4.