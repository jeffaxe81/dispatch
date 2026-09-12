# D-009 — Serviço de Assinatura Digital / ICP-Brasil — Design

## Status
Aprovado para planejamento arquitetural em 2026-09-06.

## Regra de separação
O D-009 é um módulo independente e **não será implementado dentro do repositório `jeffaxe81/dispatch`**.

Repositório alvo recomendado: `jeffaxe81/axesistemas-signature-service`.

O `dispatch` manterá somente contratos de integração e, em fase posterior, um adaptador cliente para consumir a API do serviço de assinatura.

## Objetivo
Criar um serviço independente e multi-tenant para orquestrar assinaturas digitais, inicialmente por provedor externo compatível com ICP-Brasil, preservando rastreabilidade, integridade documental e validação posterior.

## Escopo inicial D-009A
- receber documento fechado para assinatura;
- um único signatário por solicitação;
- calcular e persistir hash SHA-256 do documento antes da assinatura;
- registrar identidade e contexto do signatário;
- delegar assinatura a um `SignatureProvider` externo;
- acompanhar estados `draft`, `pending`, `signed`, `rejected`, `expired`, `failed`;
- receber retorno assíncrono por webhook autenticado;
- registrar trilha de auditoria append-only;
- persistir metadados da evidência de assinatura;
- validar posteriormente documento + evidência;
- isolar todo dado por tenant;
- nunca receber `tenantId` arbitrário como fonte de autoridade;
- nunca armazenar chave privada de certificado do usuário.

## Fora do escopo inicial
- certificado A3/token local;
- assinatura em lote;
- múltiplos signatários ou ordem de assinatura;
- coassinatura e contrassinatura;
- emissão de certificado;
- custódia de chave privada;
- aplicação de migration em ambiente real;
- integração produtiva com o Dispatch;
- escolha definitiva de fornecedor ICP-Brasil.

## Arquitetura
O serviço terá fronteiras claras:

1. `SignatureService`: regras de negócio e ciclo de vida da solicitação.
2. `SignatureProvider`: porta agnóstica de fornecedor externo.
3. `SignatureRepository`: persistência de solicitações, documentos, estados e hashes.
4. `SignatureAuditStore`: eventos append-only de auditoria.
5. `TenantContext`: contexto autenticado e resolvido no servidor.
6. `WebhookVerifier`: autenticação, anti-replay e correlação de callbacks.
7. `EvidenceValidator`: validação de integridade e evidência após assinatura.

## Contrato de domínio
### SignatureRequest
- `id: string`
- `tenantId: string` — somente interno/servidor
- `externalReference?: string`
- `documentId: string`
- `documentSha256: string`
- `signer: { name: string; documentNumber?: string; email?: string }`
- `providerCode: string`
- `providerRequestId?: string`
- `status: draft | pending | signed | rejected | expired | failed`
- `createdAt: string`
- `updatedAt: string`

### SignatureEvidence
- `signatureRequestId: string`
- `signedDocumentSha256: string`
- `providerEvidenceId?: string`
- `signedAt?: string`
- `certificateMetadata?: Record<string, unknown>`
- `timestampMetadata?: Record<string, unknown>`

## Segurança
- autenticação obrigatória entre sistemas;
- RBAC/escopo operacional no chamador e autorização server-side no serviço;
- tenant resolvido a partir da identidade/credencial autenticada;
- webhook com assinatura HMAC ou mecanismo equivalente do provedor;
- nonce/timestamp para proteção anti-replay;
- idempotência em criação e webhook;
- hashes SHA-256 antes e depois da assinatura;
- logs sem documento completo, certificado privado, token ou segredo;
- segredos apenas em secret store/configuração segura;
- rate limiting por tenant e credencial;
- fail-closed em tenant, assinatura de webhook ou correlação ambígua.

## API inicial
- `POST /v1/signature-requests`
- `GET /v1/signature-requests/:id`
- `POST /v1/signature-requests/:id/cancel` quando suportado pelo provedor
- `POST /v1/provider-webhooks/:providerCode`
- `POST /v1/signature-requests/:id/validate`

O `tenantId` não fará parte do corpo público como autoridade. O tenant será derivado da credencial/autenticação.

## Integração futura com Dispatch
O `dispatch` enviará apenas referência da ocorrência/formulário/documento, identidade do signatário permitida pelo escopo e o documento fechado. O serviço retornará `signatureRequestId`, estado e metadados de evidência.

O Dispatch não armazenará chave privada nem lógica específica de fornecedor ICP-Brasil.

## Persistência
Banco relacional recomendado: PostgreSQL para o novo serviço, mantendo independência do MySQL atual do Dispatch.

Tabelas iniciais:
- `signature_requests`
- `signature_documents`
- `signature_evidence`
- `signature_audit_events`
- `provider_webhook_receipts`
- `idempotency_keys`

Toda tabela operacional deverá possuir `tenant_id` e índices compostos adequados.

## Stack recomendada
- Node.js 24+
- TypeScript
- Fastify ou Express com fronteira HTTP isolada
- PostgreSQL
- Drizzle ORM
- Zod
- Vitest
- Docker
- GitHub Actions

## Estratégia de entrega
1. criar repositório independente;
2. bootstrap mínimo com CI e security check;
3. domínio e persistência em TDD;
4. provider fake para contrato;
5. webhook seguro e idempotente;
6. primeiro adaptador real de provedor, somente após escolha explícita;
7. validação de evidência;
8. contrato cliente para integração futura com Dispatch.

## Gates
- nenhum commit funcional diretamente em `main`;
- checkpoint antes de alterações de risco;
- RED -> GREEN para cada tarefa funcional;
- security check, TypeScript, testes e build obrigatórios;
- PR Draft até GREEN;
- merge somente com autorização explícita;
- deploy, migrations reais, credenciais e grants são gates separados.

## Critério de aceite D-009A
Uma solicitação de assinatura criada por tenant autorizado deve produzir hash do documento, ser enviada por provider fake, transicionar por webhook autenticado e idempotente até `signed`, armazenar evidência e permitir validação posterior de integridade, sem aceitar tenant arbitrário do cliente e sem armazenar chave privada.