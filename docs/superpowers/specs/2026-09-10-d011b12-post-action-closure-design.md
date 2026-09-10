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

`tenantId` participa do contexto canônico do hash, mas não precisa ser exposto como campo persistido do receipt.

## Semântica do fechamento
O builder da B12 recebe `tenantId`, um `RecoveryPostActionReconciliationReceipt` B11 e `recordedAt`.

Antes de gerar o fechamento, o builder deve verificar o receipt B11 usando `verifyRecoveryPostActionReconciliationReceipt`.

Regras:

1. B11 válido com `eligible: true` gera `closureStatus: "closed_verified"` e `reasonCode: null`.
2. B11 válido com `eligible: false` gera `closureStatus: "closed_rejected"` e preserva somente um reason code sanitizado derivado da reconciliação.
3. B11 inválido não pode gerar um fechamento positivo.
4. Nenhum fechamento B12 altera ou corrige o estado do ledger.

## Estratégia fail-closed
Qualquer condição ambígua ou inconsistente deve resultar em rejeição da evidência, nunca em `closed_verified`.

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
O verifier B12 deve expor um conjunto pequeno e sanitizado de reason codes:

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

1. B11 válido e `eligible: true` -> `closed_verified`, `reasonCode: null`.
2. B11 válido e `eligible: false` -> `closed_rejected` com reason code sanitizado.
3. B11 adulterado ou hash inválido -> fail-closed.
4. tenant incorreto -> `EVIDENCE_MISMATCH`.
5. combinação impossível entre `closureStatus` e `reasonCode` -> `INVALID_CLOSURE_STATE`.
6. `recordedAt` anterior à reconciliação -> `CLOSURE_TIMELINE_INVALID`.
7. timestamp inválido -> `CLOSURE_TIMELINE_INVALID`.
8. adulteração de qualquer identidade protegida ou fencing token -> falha de evidência.

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

- o builder derivar o fechamento somente de B11 válido;
- o verifier detectar adulterações e inconsistências;
- a cronologia for validada;
- o hash canônico incluir o contexto de tenant;
- todos os testes novos passarem;
- toda a suíte existente permanecer verde;
- TypeScript, segurança e build permanecerem verdes;
- o diff permanecer restrito ao escopo aprovado ou qualquer ampliação seja explicitamente reavaliada.

## Gate de integração
Mesmo após implementação e CI verdes, o merge na `main` continuará condicionado à autorização explícita do responsável técnico.