# M15 — Consumo de eventos do Motor de Ativos

## Objetivo

Consumir eventos versionados do Motor de Ativos para atualizar somente projeções e referências autorizadas no Despacho, preservando o Motor como dono do dado técnico do ativo.

## Invariantes

- O envelope suportado nesta versão é `eventVersion = 1`.
- A deduplicação usa a chave composta `tenantId + eventId`; o mesmo identificador em tenants diferentes não colide.
- `correlationId` acompanha a trilha de auditoria.
- Versão de envelope desconhecida falha fechado e não atualiza projeção.
- Tipo de evento desconhecido é registrado como ignorado e não altera projeção.
- O consumidor não altera automaticamente estado, prioridade, despacho, encerramento ou outro estado crítico da ocorrência.
- Não existe consulta direta ao banco do Motor de Ativos.

## Eventos inicialmente projetáveis

- `asset.created`
- `asset.updated`

Novos tipos devem entrar por contrato versionado e teste antes de produzir efeito operacional.

## Deduplicação e transporte

A camada de domínio mantém a deduplicação durante a vida da instância do consumidor. Em execução distribuída ou após reinício, o adaptador de mensageria/persistência deve garantir idempotência durável usando a mesma chave `tenantId + eventId` antes de confirmar a mensagem. Esta microentrega não cria migration produtiva nem acopla o consumidor a uma tecnologia específica de broker.

## Falhas e reprocessamento

Falhas antes da atualização da projeção podem ser reenfileiradas pelo transporte. O evento só entra no conjunto processado depois que a projeção é atualizada com sucesso. Eventos rejeitados por versão não suportada exigem evolução explícita do contrato; não devem ser repetidos indefinidamente.

## Segurança multi-tenant

Nunca deduplicar apenas por `eventId`. Toda projeção e auditoria deve carregar o `tenantId` do envelope validado. Nenhum evento autoriza consulta SQL cruzada ou mudança automática de estado crítico no Despacho.

## Validação

O gate da M15 exige segurança, TypeScript, testes, build e empacotamento Docker em GREEN no HEAD candidato ao merge, além dos workflows auxiliares já existentes no repositório.
