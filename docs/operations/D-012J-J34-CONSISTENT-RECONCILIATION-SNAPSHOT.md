# D-012J J34 — snapshot consistente da reconciliação de probe

## Objetivo

Eliminar a janela de leitura existente no J33 entre o estado do circuit breaker e suas auditorias. O J34 captura as duas projeções dentro da **mesma transação de leitura**, usando snapshot consistente, e entrega o conjunto ao classificador conservador do J33.

O J34 continua sendo diagnóstico interno. Ele não autoriza nem executa probe, replay, chamada externa ou reprocessamento automático.

## Contrato transacional

O reader J34 exige suporte a transação e executa as leituras com:

- `isolationLevel: "repeatable read"`
- `accessMode: "read only"`
- `withConsistentSnapshot: true`

Se a implementação de banco não oferecer transação, o reader falha fechado antes de qualquer leitura.

A primeira consulta resolve o circuito exclusivamente por `organization_id + system`. Somente quando o circuito existe a segunda consulta lê as auditorias permitidas pelo `resource_id` retornado dentro da mesma transação.

## Dados permitidos

Estado do circuito:

- `id`
- `organizationId`
- `system`
- `state`
- `version`
- `consecutiveFailures`
- `executionConsumedAtMs`

Auditoria:

- `resourceId`
- `action`
- `beforeData`
- `afterData`

Nenhum token de lease/probe, endpoint, credencial, payload externo, ator ou erro SQL bruto é selecionado ou devolvido.

## Classificação

O J34 reutiliza `classifyIntegrationProbeAudit` do J33. Portanto preserva os estados conservadores:

- `not_found`
- `manual_review_required`
- `circuit_closed_verified`
- `circuit_opened_verified`
- `evidence_missing`
- `inconsistent`
- `history_advanced`

E preserva obrigatoriamente:

- `permitsReplay: false`
- `permitsProbe: false`
- `permitsExternalCall: false`
- `permitsAutomaticReplay: false`

Histórico com 200 registros permanece `inconsistent`, sem assumir completude.

## Gate

O reconciliador J34 somente permite leitura quando todos os controles estão presentes:

- `NODE_ENV=test`
- `AXE_RUNTIME_ENV=homologation`
- `AXE_INTEGRATION_PROBE_J34_ENABLED=true`

Não há rota HTTP/tRPC, UI, scheduler, worker, endpoint externo, adapter real ou alteração de circuit breaker.

## TDD e evidências

RED inicial — commit `265122de776caeb93c23ff27c22704353ac96ffa`:

- segurança GREEN;
- TypeScript GREEN;
- 352 arquivos existentes / 1.696 testes existentes GREEN;
- única suíte nova falhou porque o módulo J34 ainda não existia.

Primeiro GREEN — commit `7405ac4798205d547f2778d135a1112c755fdd6c`:

- implementação mínima transacional;
- 353 arquivos / 1.703 testes GREEN;
- segurança, TypeScript, build e Docker GREEN;
- SLA MySQL homologation GREEN;
- Integration outbox MySQL homologation GREEN.

RED de hardening — commit `923cf9b8f0e530e604a5ed05b77b1ee3c656258e`:

- teste passou a exigir `repeatable read + read only + consistent snapshot`;
- suíte principal falhou antes da alteração de produção.

GREEN de hardening — commit `998a0783938731c7a263b2582e79c4f363c7214a`:

- segurança: 22 migrações e 22 correções/invariantes preservadas;
- TypeScript GREEN;
- 353 arquivos / 1.703 testes GREEN;
- build GREEN;
- empacotamento Docker GREEN;
- SLA MySQL homologation GREEN;
- Integration outbox MySQL homologation GREEN.

## Limitações e segurança

As homologações MySQL existentes demonstram ausência de regressão nas suítes de SLA/outbox, mas **não** representam ativação produtiva do novo reader J34. O J34 não está exposto a tráfego e não realiza integração externa.

Antes de qualquer uso além do diagnóstico opt-in de homologação, continuam necessários gates separados para desenho de exposição, autorização administrativa, execução controlada em ambiente real e evidência específica da nova leitura transacional.

## Restrições de fechamento

Este artefato não autoriza:

- merge na `main`;
- deploy;
- migration real;
- chamada externa;
- probe/replay;
- scheduler/worker;
- endpoint/UI;
- grants automáticos;
- remoção de checkpoints.
