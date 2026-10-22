# D-012J J6B — métricas completas do SLA por tenant

## Implementação
- `workflowSlaOperational.metrics({})` exige usuário ativo, autorização `workflow_tasks.view` e tenant **resolvido no servidor**; não aceita organização informada pelo cliente.
- Consulta MySQL agrega todos os registros *elegíveis* sem `LIMIT` ou paginação: somente intenções pending/leased/dead_letter ligadas a tarefas open/in_progress, versão e nó congelados coincidentes, organização da intenção e escopo da execução coincidentes.
- Soma: pending, leased, deadLetter, expiredLeases, waitingRetries, overdue e maxLagMinutes. Os instantes são UTC ISO-8601 e o SQL compara epoch-ms para horários e leases/retry. A implementação exige o contrato existente de sessão MySQL UTC.
- Sem destinatários, tokens, payload, mensagens de erro bruto ou IDs de execução na resposta. SQL em leitura, sem writes.
- Contagens e cardinalidade são verificadas antes de sair da camada de persistência; incongruências ou indisponibilidade retornam erro, nunca zero fictício.
- O widget mostra **totais por empresa** separadamente do **recorte filtrado e limitado**, sem misturar os dois significados.

## Limites
- A palavra *completo* refere-se ao conjunto de intenções SLA operacionais elegíveis sob esse contrato, **não** a todas as ocorrências, tarefas históricas ou notificações já entregues.
- Esse é um snapshot de consulta; linhas podem mudar entre os requests de lista, métricas e prontidão. Não há transação global entre os três.
- **A prontidão segue disabled.** Não existe ainda evidência atestada do scheduler ou adapter e a agregação não deve ser utilizada para anunciar GO, disparar scheduler ou liberar entrega externa.
- Ainda é necessário validar a política de limiares e telemetria real dos adapters antes de integrar a J5 ao `/health/ready` global.

## Gates
1. TypeScript, segurança, todos os testes, build e Docker via workflow Qualidade.
2. MySQL 8.4 físico descartável, timezone UTC e suite de concorrência/CAS, incluindo ensaio J6B de inclusão e exclusão de registros por tenant/scope.
3. Homologação visual com perfil que possui e não possui `workflow_tasks.view`, com filas grandes e falha de conexão.
4. Manter a PR Draft; **sem merge automático, migrations em dados reais, grants, deploy, cron, notifications, replay ou alteração de Ocorrência**.
