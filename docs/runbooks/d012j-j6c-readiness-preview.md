# D-012J J6C — prévia passiva de prontidão SLA

## O que existe de verdade
- O scheduler SLA atual é um **planejador puro de eventos**. Não há serviço periódico atestado com heartbeat e o worker de entrega continua apenas manual em homologação.
- O módulo de diagnóstico J6C faz **leitura do MySQL via agregação integral J6B com tenant resolvido no servidor** e usa o avaliador puro J5. Não cria health positivo para scheduler/adapters inexistentes.
- Sem probes registrados, os componentes reportam **unknown** e o diagnóstico da prévia é **not_ready**, mesmo quando o backlog está zerado.
- O widget exibe componentes e motivos fixos, sanitizados; não reproduz payload, exceções, contatos, tokens nem mensagens brutas.
- Uma futura integração de probes deverá fornecer `organizationId`, estado e `checkedAt` UTC; evidências de outro tenant, antigas, futuras, ausentes ou com erro jamais provam saúde.

## Gates de ativação da leitura
O endpoint autenticado `workflowSlaOperational.diagnostic({})` já exige `workflow_tasks.view` e tenant ativo. O **modo de prévia de homologação** só pode ser habilitado com todas as condições:
```text
NODE_ENV != production
AXE_RUNTIME_ENV=homologation
AXE_SLA_READINESS_PREVIEW_ENABLED=true
```
Em quaisquer outras combinações, retorna `disabled` **sem consultar banco ou sondas**. Esta flag é exclusivamente para diagnóstico e não autoriza ativar scheduler, envio, retry, lease ou mutação.

Limites iniciais **somente para visualização em homologação**: pendentes 10/50; atraso 15/60 minutos; TTL de evidências de 60 segundos. A política não está conectada ao `/health/ready` global e não é um SLO ou autorização de produção.

## Verificação
1. Rodar Qualidade (TypeScript, segurança, testes, build e Docker) e SLA MySQL 8.4 em commit idêntico.
2. Verificar modo default/produção desabilitado, leitura ativa apenas no ambiente homologation com flag explícita, isolamento por tenant, RBAC e input vazio.
3. Falhas de MySQL não podem expor conexão/SQL, e evidência de outro tenant ou vencida deve ser `unknown`.
4. Avaliar em homologação real a implantação futura de **probes de scheduler/adapter**, com autenticação, garantia de tenant, heartbeat persistente e TTL. Sem esses dados, a J6C **não** anuncia `ready`.

PR Draft empilhada sobre J6B; sem merge em main, migrations, deploy, grants, worker, timers, alertas externos, replay, agendamento automático ou mutação de Ocorrência.
