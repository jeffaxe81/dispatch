# D-012J J6F — promoção manual e fencing de fonte SLA

## Objetivo e escopo

J6F cria uma **composição interna** para transferir a autoridade de heartbeat de um emissor para outro, por empresa e componente (`scheduler` ou `adapter`). Não ativa processos de scheduler, não opera serviços reais de comunicação, não executa cron e não constitui GO operacional.

A fonte atual é identificada pela linha MySQL `workflow_sla_component_heartbeats`, PK (`organization_id`, `component`). O método `createSlaHeartbeatMySqlStore(db).promote(...)` executa `SELECT ... FOR UPDATE` na linha corrente e confere `expectedSourceId` *dentro da mesma transação*. Se o registro não existe, fonte mudou, relógio regrediu ou a fonte está saudável/degradada e recente (janela de 60 segundos), **recusa transferência**.

Após aprovação e atualização atômica:
- `source_id` passa ao novo emissor aprovado;
- `sequence=0`, `sent_at_ms=0`, `received_at_ms` registra o tempo do servidor, `state=unhealthy`;
- o painel retorna **unknown** até que o sucessor gere **seu próprio** heartbeat recém-assinado;
- o emissor antigo é recusado pelo storage mesmo se possuir HMAC válido e enviar sequência maior;
- apenas uma de duas transferências concorrentes com a mesma fonte antiga pode vencer.

O emissor novo deve possuir credencial distinta e cadastrada no resolvedor confiável de assinatura. Para leitura, atualizar a **allowlist de fonte por tenant** na configuração de homologação da J6E. Não utilizar `ready` durante promoção/rotação.

## Gate manual independente

A composição `createSlaManualFailover` só aceita execução quando **todas** as condições abaixo forem verdadeiras:

```text
NODE_ENV != production
AXE_RUNTIME_ENV=homologation
AXE_SLA_FAILOVER_ENABLED=true
operatorApproved=true
```

A aprovação e a identificação de `expectedSourceId` e `nextSourceId` devem ser obtidas por fonte de configuração/registro **server-side**. A flag booleana **não substitui autenticação/RBAC**: um futuro entrypoint deverá verificar operador, aprovação e auditoria operacional **antes** de chamar o módulo. J6F não expõe rota HTTP/tRPC, não cria usuários, não publica segredo e não inclui endpoint que aceite source IDs de clientes. O relógio vem do servidor; testes injetam relógio para determinismo.

## Ensaios e limites

- Unitários: bloqueios de ambiente, operador sem aprovação, relógio inválido, políticas inválidas, CAS conflitante, erros sem vazamento de SQL.
- MySQL 8.4 descartável: fonte inicial healthy, recusa de promoção antecipada, duas conexões disputando a mesma transferência, bloqueio do emissor antigo, evidência zerada, novo heartbeat HMAC autêntico e isolamento entre empresas.
- Retorno `fenced` significa **troca do direito de escrever evidência**, não prova de failover dos serviços operacionais. Sem observação real do scheduler/adapter, readiness ainda pode ser `not_ready`.

**Proibido nesta PR:** merge na main, implantação, migração produtiva, grant, execução de scheduler/adapter, envio de alertas, replay, escalonamento, alteração de ocorrências ou promoção automática.

## Próximo gate

Conectar fontes reais confiáveis com autenticador, operação do lease e healthcheck, exigir rastro de aprovação/auditoria, definir rotação de chaves e exercícios multi-instância sob falha real. A capacidade de transferência do *heartbeat* não equivale a promoção efetiva de workers.
