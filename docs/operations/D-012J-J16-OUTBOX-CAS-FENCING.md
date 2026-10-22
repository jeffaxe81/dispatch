# AXE Dispatch — D-012J J16: CAS e fencing da outbox externa

**Situação:** desenvolvimento em branch/PR Draft. Nada desta entrega foi aplicado ao banco operacional.

## Contexto

Continua a J15 (estrutura MySQL e migration aditiva da outbox de integrações) com uma camada de armazenamento explicitamente escopada por organização. A J16 **não** executa chamada a NEO, Inventário ou CRM e não ativa scheduler, worker, notificações nem replay de DLQ.

## Contrato

- Leitura: `loadByTenant({ deliveryId, organizationId })`, com ambos os identificadores obrigatórios na cláusula WHERE.
- Escrita: `compareAndSwap({ organizationId, deliveryId, expectedVersion, current, next })`, filtrando ID, organização, versão, estado atual, token de lease e metadados imutáveis de integração.
- Conflito: `affectedRows === 0` retorna `false`. Mais de uma linha alterada é erro de integridade; jamais sinalizar êxito.
- Claim puro: `buildIntegrationOutboxClaim` só reserva `pending` elegível, com orçamento de tentativas disponível. Emite token, worker, expiração e incremento de versão/tentativa. Claim só é válido depois do CAS persistido.
- Resolução pura: `buildIntegrationOutboxResolution` valida token e expiração do lease para `delivered`, `retry` ou `dead_letter`. Lease expirado ou token antigo falha fechado.
- Metadados de integração e organização são imutáveis durante as transições de CAS.
- Nenhum replay automático de `dead_letter` ou `delivered`.

## Segurança

A autorização do tenant deve ocorrer **antes** da criação de um adaptador com acesso ao DB. Esta entrega não inclui endpoint público nem concessão de nova permissão. Logs e retornos não incluem payloads, credenciais, resposta HTTP bruta ou stack externa. O único campo relativo ao payload é uma referência opaca, não seu conteúdo.

Os testes automatizados usam um DB fake e verificam consultas/UPDATE em SQL, mas **não substituem** ensaio de concorrência na tabela `integration_delivery_outbox` de um MySQL 8.4 real com migration 0018 aplicada em homologação isolada.

## Critérios para evolução

1. Homologar a migration 0018 em base descartável e restaurável.
2. Conectar com o planejador J13 reconciliado (validar o estado `half_open` antes de qualquer probe).
3. Adicionar transaction/lease-recovery e cursor de claim tenant-safe com teste de concorrência real.
4. Garantir entrega via outbox somente quando RBAC, auditoria e feature gate forem explicitamente aprovados.
5. Planejar ensaios de outbox duplicada, crash após envio, fencing e expurgo por tenant.
6. Preservar merge na main, migração operacional e deploy sob autorização separada.

**Não há GO para produção nem habilitação de integrações.**
