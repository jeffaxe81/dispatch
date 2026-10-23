# D-012J J23 — coordenador interno de outbox sobre CAS existente

**Escopo:** homologação isolada; não é dispatcher, scheduler, pipeline produtiva ou grant de autorização.

## Reconciliação de J16 #151/#152

O PR #151 especifica `transitionIntegrationDelivery` e `createIntegrationDeliveryCoordinator`, mas disponibiliza **apenas testes** sem a implementação. A cadeia J16 #152 → J22 já possui estado, transições puras e CAS real. A J23 preserva o código e o schema existente e expõe **somente um coordenador interno** `createIntegrationOutboxCasCoordinator`, para ligar leitura por tenant, decisão pura e compare-and-swap.

- `claim()`: lê por organização+ID, consulta o relógio após a leitura, constrói a transição com `buildIntegrationOutboxClaim` e persiste via `compareAndSwap`. Conflito de CAS não é sucesso.
- `resolve()`: exige organização, ID, worker, versão esperada, lease token e resultado discriminado `delivered | retry | dead_letter`. O relógio é obtido internamente. Rejeita versão obsoleta, worker/token divergente e expiração de lease. Confirma somente por CAS tenant-scoped.
- `IntegrationOutboxCoordinatorConflictError`: conflito explícito de versão/concorrência.
- Não reimplementa schema de outbox, idempotência ou regras de resolução.

## Segurança: limites importantes

1. O código exige conjuntamente `NODE_ENV=test`, `AXE_RUNTIME_ENV=homologation` e `AXE_INTEGRATION_OUTBOX_J23_ENABLED=true` antes de consultar o armazenamento e antes do CAS.
2. A organização é um escopo **de fonte confiável**, a ser resolvido por sessão autenticada em futura integração; não se expõe rota/handler HTTP.
3. A coordenação de outbox **não equivale** à autorização do circuito. A J22 define `half_open: allowAttempt=false`; um probe futuro depende de lease/fencing **separado, persistido por tenant e sistema**, RBAC e auditoria operacional antes de qualquer entrega externa.
4. Não há envio a NEO, Inventário ou CRM, integração com provedor, replay administrativo automático, credenciais, migração, concessão de permissões, agendamento ou mutação de Ocorrências.
5. A claim aceita o token do chamador interno e não o gera ou distribui. Proteção contra reutilização exige geração criptograficamente forte e persistência segura na camada de execução futura.
6. Cancelamento de tentativa/expiração após o CAS não pode ser revertido por mero gate: somente transação compensatória ou quarentena auditada, conforme operações homologadas, poderá tratar esses casos. Não se afirma garantia de transporte exatamente uma vez.

## Evidências

- Testes unitários J23: nove casos de concorrência, terminal/retry, worker/versão/token obsoleto, expiração exata, isolamento de tenant, armazenamento malicioso, opt-in e conflito explícito.
- Dois ensaios adicionais na CI `Integration outbox MySQL homologation` em banco MySQL 8.4 descartável: um único claim concorrente e escopo/versão protegidos.
- Mantidas pipelines Qualidade e SLA MySQL para regressões na cadeia inteira.

## Gates restantes

O fechamento de #151 requer mapear suas expectativas de modelo UTC e cooldown contra o modelo epoch-ms já homologado e registrar critérios equivalentes ou exceções; não substituir testes faltantes por alegações. A J13 #146 representa uma política diferente da herdada #145 e deve ser comparada separadamente. Esta J23 continua Draft, empilhada sobre #164, sem merge na `main`.
