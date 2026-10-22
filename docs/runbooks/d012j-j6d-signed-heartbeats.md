# D-012J J6D — autenticação e persistência de evidências SLA

## Entrega

O módulo J6D cria um contrato de **heartbeat de SLA autenticado**, separado de `server/_core/heartbeat.ts` (que é serviço de agendamento). Componentes permitidos: `scheduler` e `adapter`. A mensagem v1 contém `organizationId`, `component`, `sourceId`, `sequence`, `state` (healthy/degraded/unhealthy), `sentAt` UTC estrito e `signature` HMAC-SHA256 hex.

**Protocolo de assinatura:** HMAC-SHA256 sobre JSON.stringify do array na ordem fixa:
```text
["axe-dispatch-sla-heartbeat-v1", organizationId, component, sourceId, sequence, state, sentAt]
```
Chave de pelo menos 32 bytes, resolvida **somente no servidor por tenant e componente**, com `sourceId` autorizado. Comparação de MAC em tempo constante. A assinatura inclui todas as dimensões, impossibilitando reuso válido entre tenants e componentes.

O serviço valida relógio do servidor e tolera no máximo 60 segundos de idade (sem aceitar tempo futuro); a leitura expira evidências antigas e devolve `unknown`. Mensagens inválidas, repetidas, de emissor desconhecido ou com sequência regressiva são rejeitadas sem ecoar segredos.

A migração `0018_d012j_sla_component_heartbeats` adiciona tabela própria com PK composta `organization_id/component`, vínculo FK ao tenant, source ID, sequence, state, timestamps do emissor e recepção. O storage transacional emprega `SELECT FOR UPDATE` sobre o registro existente e rejeita sequência e instante não crescentes; o índice único rejeita dupla inserção inaugural concorrente. **A migração fica versionada, não aplicada na produção nesta PR.**

## Portões de segurança

Não existe endpoint HTTP ou tRPC de ingestão. A composição exige implementador confiável para resolver fonte e segredo, e requer explicitamente:
```text
NODE_ENV != production
AXE_RUNTIME_ENV=homologation
AXE_SLA_HEARTBEAT_INGEST_ENABLED=true
```
Nenhuma dessas variáveis, isoladamente, cria emissor, cron, rotina de escrita ou autoriza deploy.

`createSlaHeartbeatService(...).probe` devolve evidência escopada compatível com o contrato opcional `schedulerProbe/adapterProbe` da prévia J6C. **Ainda não está conectado ao runtime público**: registrar um heartbeat de teste não é prova de um scheduler realmente em execução. Antes da futura conexão é obrigatório identificar o emissor REAL, aprovar sua identidade/chaves, planejar rotação de fontes, cobrir múltiplas instâncias/HA e registrar o fluxo seguro de ativação.

A J6C permanece `disabled` por padrão, e na prévia de homologação continua `not_ready` sem probes conectados. Não alterar `/health/ready` nem inferir GO de um registro assinado isolado.

## Testes e aceite

- Unitários: assinatura adulterada, fonte não autorizada, tenant trocado, segredo fraco, data inválida, futuro, TTL, replay, sequence, desativação em produção e sanitização.
- MySQL 8.4 descartável: migrations ordenadas, gravação/consulta por tenant e componente, duas conexões disputando o mesmo heartbeat e falha fechada de duplicata.
- CI de qualidade: segurança, TS, testes, build e Docker; sem execução produtiva.
- PR permanece Draft; nenhum merge em `main`, grant, deploy, scheduler, disparo de mensagem, replay, alteração de Ocorrência ou escrita em banco operacional.
