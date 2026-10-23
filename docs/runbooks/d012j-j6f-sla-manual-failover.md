# D-012J J6F — transferência manual e auditada de heartbeat SLA

## Objetivo
Permitir **troca controlada de fonte de evidência** após perda comprovada de heartbeat de um componente, sem afirmar que houve comutação automática do scheduler ou dos adapters. A transferência é um ensaio de homologação e não inicia serviços.

A J6D congelava `sourceId` de uma combinação `organization_id/component`; J6F define o caminho administrativo seguro para trocar a fonte, **sem edição manual direta do banco**. O store transacional J6F:
1. Faz `SELECT ... FOR UPDATE` da linha de `workflow_sla_component_heartbeats` para o tenant e componente exatos.
2. Exige `expectedSourceId` e `expectedSequence` idênticos ao registro; não permite promoção de fonte idêntica ou sequência próxima do limite seguro.
3. Exige heartbeat anterior com **idade estritamente maior que 60.000 ms**: no limite de 60 segundos ainda é proibido.
4. Troca para `nextSourceId`, incrementa a sequência e registra `state = unhealthy`, com timestamps atuais. Assim, **nenhuma instância herda o healthy antigo**. O novo emissor precisa apresentar novo heartbeat HMAC próprio, com sequência ainda maior.
5. Insere a auditoria `workflow_sla_heartbeat/manual_source_handover`, com ator, origem, destino, sequência e motivo, **na mesma transação**. Falha da auditoria reverte a transferência.
6. Concorrentes perdem pelo CAS; a fonte antiga é impedida de aceitar novos beats, mesmo com assinatura antiga válida, porque `sourceId` diverge do novo registro.

## Portões de autorização
Não há rota HTTP, tRPC, agendamento ou processo de takeover. A biblioteca `createSlaHeartbeatManualFailover` exige:
- `NODE_ENV != production`, `AXE_RUNTIME_ENV=homologation`, `AXE_SLA_HEARTBEAT_FAILOVER_ENABLED=true`.
- `operatorApproved=true` e `actorUserId` positivo.
- **Callback independente obrigatório** `authorize` que valide organização, ator, componente, fonte anterior, fonte seguinte, sequência esperada e motivo; um booleano isolado não autentica.
- Motivo controlado `source_lost` ou `planned_maintenance`.
- UTC ISO-8601 estrito e identificadores válidos. Falhas retornam mensagens sanitizadas, sem DSN, chaves, payloads ou informação de outros tenants.

## Condições para recuperação
Antes da transferência, confirmar em homologação a identidade autenticada do operador, o estado do serviço anterior, a perda do heartbeat, a identidade previamente autorizada da reserva e sua chave independente. Após promover a reserva, **atualizar o allowlist de leitura** (`AXE_SLA_HEARTBEAT_SOURCE_SCHEDULER` ou `AXE_SLA_HEARTBEAT_SOURCE_ADAPTER`) para a nova fonte, executar uma prova de vida real do processo substituto e aceitar o heartbeat assinado com sequência crescente.

O read-only `workflowSlaOperational.diagnostic` continuará `unknown/not_ready` se a fonte não for permitida, se faltar o novo heartbeat ou se a evidência expirar. Essa transferência altera somente **a titularidade da evidência**, e não a distribuição de tarefas, filas, chamadas, scheduler, adapters, endpoints ou lease de entrega. O processo de failover operacional real deverá ter fencing próprio, quórum, replay controlado e testes antes de GO.

## Gates da PR
- Qualidade: segurança, TypeScript, testes unitários, build, Docker.
- SLA MySQL 8.4 descartável: migration 0018, duas conexões concorrendo, um vencedor, auditoria única, rejeição em período ainda fresco, impossibilidade de heartbeat da fonte revogada e novo heartbeat próprio aceito.
- PR **Draft**, empilhada na J6E, sem merge main, deploy, migração em produção, grants, emissão automatizada, alertas, replay ou mutação de ocorrências.
