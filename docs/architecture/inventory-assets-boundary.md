# Fronteira Arquitetural — Motor de Ativos / Inventário

## Objetivo

Esta fronteira define como o Sistema de Despacho pode se integrar ao Motor de Ativos / Inventário sem incorporar regras de negócio, persistência ou dependências internas do produto de Inventário.

## Ownership e separação de dados

O Motor de Ativos / Inventário é proprietário do cadastro, estado, histórico e demais dados de ativos. O Sistema de Despacho permanece proprietário de ocorrências, ordens, equipes, jornadas e demais dados operacionais do despacho.

A integração entre os produtos ocorre exclusivamente por **REST versionado** e **eventos versionados**. O Despacho não conhece tabelas, entidades ORM, repositories ou detalhes de persistência do Motor de Ativos.

É proibido acesso direto de um produto ao banco do outro. A regra é **sem SQL cruzado**, sem consultas entre schemas, sem compartilhamento de credenciais de banco e sem gravação direta na persistência do outro domínio.

## Identidade, escopo e segurança

Toda chamada de integração deve carregar a identidade opaca de **tenant** e usuário conforme o contrato publicado, além de identificador de **correlação**. O receptor valida o tenant e o escopo antes de executar qualquer operação.

Comandos que possam ser repetidos por retry, reenvio ou falha de rede devem usar chave de **idempotência**. A política de validação é **fail-closed**: ausência ou invalidade de tenant, usuário, correlação, versão de contrato ou escopo autorizado interrompe o processamento.

Contratos não transportam objetos internos do banco do Despacho nem do Inventário. Envelopes de erro são estritos e não podem expor stack trace, SQL, segredo, token ou detalhe interno de persistência.

## REST e eventos

A versão inicial REST é `v1`. Mudanças incompatíveis exigem nova versão; uma versão existente não deve sofrer quebra silenciosa de contrato.

Eventos usam envelope versionado contendo ao menos `eventId`, `eventType`, `occurredAt`, `tenantId`, `correlationId`, `producer` e `payload`. Quando houver ator humano conhecido, `actorUserId` poderá ser informado. Consumidores devem validar o envelope antes de processar o payload.

## Observabilidade

A **Observabilidade** da integração deve permitir rastrear versão do contrato, correlação, resultado, duração/latência e categoria de falha. Logs e métricas não devem registrar payload sensível, credenciais, tokens, stack interno ou conteúdo que viole a política de dados.

Uma mesma correlação deve permitir acompanhar a operação entre Despacho e Inventário sem exigir acesso ao banco do outro produto.

## Rollback

O **Rollback** da M0 consiste em reverter os contratos e esta documentação caso a fronteira precise ser redesenhada. A M0 não cria estado persistente do Inventário dentro do Despacho e executa **nenhuma migration**, portanto não existe rollback de banco nesta etapa.

A introdução futura de endpoints, consumidores de eventos, credenciais, grants ou infraestrutura deverá possuir plano de rollback próprio na microentrega correspondente.

## Checklist da M0

- Segurança: identidade de tenant/usuário, correlação, idempotência quando aplicável, validação fail-closed e envelopes estritos.
- Isolamento: sem SQL cruzado, sem conexão direta ao banco do outro produto e sem tabelas do Inventário no schema do Despacho.
- Observabilidade: correlação, resultado e latência sem exposição de dados sensíveis.
- Rollback: reversão somente de código/documentação, pois há nenhuma migration nesta M0.
- Documentação: contrato `shared/inventoryIntegration/v1.ts`, esta fronteira arquitetural e plano executável versionados no repositório.
