# D-011B.12 — Post-Action Closure Audit

## Status
Design aprovado em conversa. Esta especificação formaliza a microentrega antes do plano de implementação e do ciclo TDD.

## Contexto
A cadeia D-011B atualmente separa execução simulada, verificação pós-ação, reconciliação e validação de evidências. O estado `completed_success` do ledger representa que a execução simulada terminou com sucesso. Esse estado já é terminal no contrato atual e não deve ser reinterpretado nem reescrito nesta microentrega.

A D-011B.11 introduziu um receipt de reconciliação pós-ação verificável, ligando execução, verificação e ledger sem mutar o estado do ledger. A D-011B.12 adicionará um fechamento final append-only, auditável e verificável do ciclo de recovery, preservando a semântica atual do ledger.

## Decisão arquitetural
Adotar uma camada de fechamento append-only separada da máquina de estados do ledger.

`completed_success` continuará significando somente “a execução simulada terminou com sucesso”.

O resultado final do ciclo completo será expresso por um novo receipt de fechamento pós-ação. Esse receipt não altera `RecoveryActionRecord`, não faz compare-and-set e não redefine estados terminais existentes.

Fluxo lógico:

`execução -> verificação pós-ação -> reconciliação B11 -> closure B12`

## Objetivo
Criar um artefato final verificável que registre se o ciclo pós-ação foi encerrado como validado ou rejeitado, consumindo exclusivamente um receipt B11 já existente e verificável.

## Não objetivos
Esta microentrega não deve:

- alterar `recoveryActionRecord.ts`;
- alterar `recoveryExecutionBoundary.ts`;
- criar novos estados do ledger;
- reabrir estados terminais;
- escrever em banco de dados;
- adicionar CAS ou outra mutação de ledger;
- acionar executor real;
- executar restart, retry, failover, restore, rollback ou migration;
- integrar com systemd, Docker, Podman, Kubernetes, SSH, cloud ou hypervisor;
- fazer deploy;
- habilitar recovery produtivo automaticamente.

## Contrato principal
Criar `RecoveryPostActionClosureReceipt` com os seguintes campos:

- `eventType: "recovery.post_action.closure"`;
- `evidenceVersion: "d011b12-v1"`;
- `evidenceId: string`;
- `reconciliationEvidenceId: string`;
- `executionEvidenceId: string`;
- `verificationEvidenceId: string`;
- `actionId: string`;
- `componentId: string`;
- `correlationId: string`;
- `fencingToken: number`;
- `closureStatus: "closed_verified" | "closed_rejected"`;
- `reasonCode: RecoveryPostActionClosureReasonCode | null`;
- `reconciliationRecordedAt: string`;
- `recordedAt: string`.

`RecoveryPostActionClosureReasonCode` deve ser restrito aos reason codes sanitizados que já podem existir em uma reconciliação B11 inelegível; a B12 não introduz motivos de negócio adicionais no receipt.

`tenantId` participa do contexto canônico do hash, mas não precisa ser exposto como campo persistido do receipt.

## Contrato do builder
O builder recebe `tenantId`, um `RecoveryPostActionReconciliationReceipt` B11 e `recordedAt` e retorna uma união discriminada:

- sucesso: `{ built: true, receipt: RecoveryPostActionClosureReceipt }`;
- falha de origem: `{ built: false, reasonCode: "RECONCILIATION_EVIDENCE_INVALID" }`.

Antes de produzir qualquer receipt B12, o builder deve verificar o receipt B11 usando `verifyRecoveryPostActionReconciliationReceipt` com o mesmo `tenantId` recebido.

Um receipt B11 inválido, inclusive por tenant incorreto, hash divergente, estado semântico inválido ou cronologia inválida, **não gera receipt B12**. Essa condição retorna somente `RECONCILIATION_EVIDENCE_INVALID`.

## Semântica do fechamento
Quando o B11 é válido:

1. `eligible: true` gera `closureStatus: "closed_verified"` e `reasonCode: null`.
2. `eligible: false` gera `closureStatus: "closed_rejected"` e preserva exatamente o reason code sanitizado não nulo da reconciliação.
3. `closed_verified` nunca pode coexistir com `reasonCode` não nulo.
4. `closed_rejected` nunca pode coexistir com `reasonCode: null`.
5. Nenhum fechamento B12 altera ou corrige o estado do ledger.

## Estratégia fail-closed
Qualquer condição ambígua ou inconsistente deve resultar em falha de construção ou rejeição da evidência, nunca em `closed_verified`.

O verifier B12 deve rejeitar pelo menos:

- `eventType` incorreto;
- `evidenceVersion` incorreta;
- hash canônico divergente;
- tenant incorreto;
- combinação incoerente entre `closureStatus` e `reasonCode`;
- `reconciliationRecordedAt` inválido;
- `recordedAt` inválido;
- fechamento registrado antes da reconciliação;
- adulteração de `reconciliationEvidenceId`;
- adulteração de `executionEvidenceId`;
- adulteração de `verificationEvidenceId`;
- adulteração de `actionId`, `componentId` ou `correlationId`;
- adulteração de `fencingToken`.

## Reason codes do verifier
O verifier B12 deve expor somente:

- `EVIDENCE_MISMATCH`;
- `INVALID_CLOSURE_STATE`;
- `CLOSURE_TIMELINE_INVALID`.

Detalhes internos não devem vazar para consumidores.

## Hash canônico
O `evidenceId` deve ser SHA-256 sobre uma representação canônica estável contendo, no mínimo:

- versão `d011b12-v1`;
- `tenantId`;
- `reconciliationEvidenceId`;
- `executionEvidenceId`;
- `verificationEvidenceId`;
- `actionId`;
- `componentId`;
- `correlationId`;
- `fencingToken`;
- `closureStatus`;
- `reasonCode`;
- `reconciliationRecordedAt`;
- `recordedAt`.

A ordem da representação canônica deve ser determinística e coberta por testes.

## Isolamento e dependências
A B12 deve ser implementada em uma unidade pura e independente, sem I/O.

Dependência permitida:

- `recoveryPostActionReconciliationAudit.ts`, para tipos e verificação B11.

Não deve depender de adapters de armazenamento, banco, rede ou executor.

## Arquivos previstos
Escopo inicial limitado a dois novos arquivos:

- `server/_core/recoveryPostActionClosureAudit.ts`;
- `server/_core/recoveryPostActionClosureAudit.test.ts`.

Nenhum arquivo existente deve ser alterado para a implementação mínima. Se os testes revelarem necessidade de modificar contrato existente, a microentrega deve ser interrompida e reclassificada antes de ampliar o escopo.

## Estratégia TDD
A implementação deverá seguir RED -> GREEN -> hardening.

Casos mínimos:

1. B11 válido e `eligible: true` -> builder produz `closed_verified`, `reasonCode: null`.
2. B11 válido e `eligible: false` -> builder produz `closed_rejected` com o reason code sanitizado da reconciliação.
3. B11 adulterado ou hash inválido -> builder retorna `RECONCILIATION_EVIDENCE_INVALID` e não produz receipt.
4. tenant incorreto na construção -> builder retorna `RECONCILIATION_EVIDENCE_INVALID` e não produz receipt.
5. tenant incorreto na verificação de um receipt B12 existente -> `EVIDENCE_MISMATCH`.
6. combinação impossível entre `closureStatus` e `reasonCode` -> `INVALID_CLOSURE_STATE`.
7. `recordedAt` anterior à reconciliação -> `CLOSURE_TIMELINE_INVALID`.
8. timestamp inválido -> `CLOSURE_TIMELINE_INVALID`.
9. adulteração de qualquer identidade protegida ou fencing token -> `EVIDENCE_MISMATCH`.

Os testes devem demonstrar que nenhuma rota inválida produz `closed_verified`.

## Compatibilidade
A B12 deve preservar integralmente os contratos de B4 até B11.

Em especial:

- `completed_success` permanece terminal e com a mesma semântica;
- o execution boundary continua finalizando a execução simulada como hoje;
- B7/B8/B9/B10/B11 permanecem fontes da cadeia pós-ação;
- não há migração de estado nem alteração retroativa de receipts existentes.

## Segurança
A microentrega deve continuar:

- simulation-only;
- fail-closed;
- audit-only;
- sem executor real;
- sem mutation path produtivo;
- sem deploy automático.

## Critérios de aceite
A B12 será considerada pronta para revisão de implementação quando:

- o builder produzir receipt somente de B11 válido;
- B11 inválido resultar em falha de construção sem receipt;
- o verifier detectar adulterações e inconsistências;
- a cronologia for validada;
- o hash canônico incluir o contexto de tenant;
- todos os testes novos passarem;
- toda a suíte existente permanecer verde;
- TypeScript, segurança e build permanecerem verdes;
- o diff permanecer restrito ao escopo aprovado ou qualquer ampliação seja explicitamente reavaliada.

## Gate de integração
Mesmo após implementação e CI verdes, o merge na `main` continuará condicionado à autorização explícita do responsável técnico.