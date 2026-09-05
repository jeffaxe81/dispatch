# D-007D — Administração avançada, ajustes, relatórios e alertas de jornada — Design

**Data:** 04/09/2026  
**Projeto:** AXE Dispatch / Projeto Despacho  
**Prioridade:** Alta  
**Status:** Arquitetura aprovada em conversa; especificação escrita aguardando revisão/aprovação formal antes do plano de implementação.  
**Base técnica exclusiva:** `checkpoint/d007c-dispatch-work-shift-eligibility-20260904` @ `081ce9cd24a330ef5321c716282ff79469e80b66`

## 1. Objetivo

Concluir o bloco D-007 da Release 1.0 com uma camada administrativa de jornada que permita corrigir sessões de forma auditável, consultar indicadores operacionais e históricos, acompanhar exceções relevantes e reconhecer/resolver alertas sem alterar silenciosamente a fonte de verdade já estabelecida nas fases D-007A, D-007B e D-007C.

A D-007D deve reutilizar, e não substituir, sessões/eventos D-007A, escalas/cobertura D-007B e elegibilidade D-007C.

## 2. Decisão arquitetural

A D-007D será separada em quatro ciclos:

1. **D-007D1 — Ajustes auditáveis**;
2. **D-007D2 — Relatórios de jornada**;
3. **D-007D3 — Alertas de jornada**;
4. **D-007D4 — Painel administrativo e homologação final**.

Ajustes, relatórios e alertas permanecem subdomínios desacoplados sobre as mesmas fontes de verdade. A interface administrativa apenas compõe contratos server-side.

## 3. Princípios obrigatórios

1. Nenhuma edição silenciosa de jornada.
2. Sessões/eventos D-007A continuam como fonte do realizado; D-007B continua como fonte do planejado.
3. Escopo/RBAC sempre validado no servidor.
4. Nenhuma concessão automática de novas permissões.
5. Alertas inicialmente informativos, sem ações destrutivas automáticas.
6. Idempotência e deduplicação para ações administrativas e alertas.
7. Privacidade por minimização de dados.
8. Sem legislação trabalhista completa, folha ou banco de horas complexo nesta release.

## 4. D-007D1 — Ajustes auditáveis

Usar `work_shift_adjustments` ligada a `work_shift_sessions`.

Campos mínimos: `id`, `sessionId`, `requestedByUserId`, `decidedByUserId?`, `status` (`pending|approved|rejected`), `reason`, `requestedChanges`, `beforeSnapshot`, `afterSnapshot?`, `requestedAt`, `decidedAt?`, `appliedAt?`.

Mudanças permitidas na Release 1.0: correção de `startedAt`, `endedAt`, pausas acumuladas quando suportadas pelo histórico, contexto `teamId` autorizado e cancelamento administrativo de sessão inválida sem apagar histórico.

Fluxo: `request -> pending -> approve/reject`.

A aprovação deve revalidar escopo e estado, detectar conflito, calcular snapshot final server-side, materializar a correção transacionalmente e registrar `adjustment_approved` + `adjusted` com before/after. Rejeição não altera a sessão.

Concorrência: se a sessão mudou desde o `beforeSnapshot`, a aprovação falha fechado e exige nova solicitação.

## 5. D-007D2 — Relatórios

Serviço somente leitura, sem alterar estado operacional.

Relatórios mínimos: jornadas por usuário/equipe; planejado x realizado; tempo líquido; pausas; horas extras técnicas; atrasos; saídas antecipadas; sessões sem encerramento; ajustes; cobertura por faixa; candidatos excluídos por jornada quando houver evidência persistida.

Filtros mínimos: período, organização/unidade dentro do escopo, usuário, equipe, status, escala, tipo de exceção, presença de ajuste e anomalia.

Exportação reutiliza o padrão auditado existente e registra ator, filtros normalizados, instante e quantidade, sem conteúdo sensível desnecessário.

## 6. D-007D3 — Alertas

Alertas são projeções operacionais, não fonte de verdade.

Tipos iniciais:
- `SHIFT_NOT_STARTED_NEAR_PLANNED_TIME`;
- `LATE_START`;
- `PAUSE_EXCEEDED`;
- `SHIFT_OVERRUN`;
- `SHIFT_NOT_ENDED`;
- `COVERAGE_GAP`;
- `AVAILABLE_OUTSIDE_SHIFT`;
- `LEGACY_SHIFT_STATE_DIVERGENCE`;
- `DISPATCH_EXCLUDED_BY_SHIFT` quando houver evidência persistível adequada.

Estados: `open`, `acknowledged`, `resolved`.

Campos mínimos: `id`, `alertType`, `userId?`, `teamId?`, `sessionId?`, `scheduleAssignmentId?`, `dedupeKey`, `severity`, `status`, `messageCode`, `metadata`, `detectedAt`, dados opcionais de acknowledge/resolve.

A mesma condição lógica não gera múltiplos alertas abertos. Para a Release 1.0, usar avaliação determinística sob demanda/rotina existente, sem introduzir broker distribuído.

## 7. D-007D4 — Painel administrativo

Exibir no mínimo: usuários ativos, pausados, previstos sem início, jornadas extrapoladas, sessões sem encerramento, ajustes pendentes, alertas abertos por severidade, cobertura planejada x realizada e filtros por período/equipe/usuário/unidade.

Ações conforme RBAC: visualizar sessão/timeline, solicitar ajuste, aprovar/rejeitar, reconhecer/resolver alerta, abrir relatório e exportar.

## 8. RBAC

Preservar: `work_shifts.view`, `work_shifts.control`, `work_shifts.manage`, `work_shifts.adjust`, `work_shifts.approve`, `work_shift_schedules.view`, `work_shift_schedules.manage`, `work_shift_reports.view`, `work_shift_reports.export`.

Adicionar apenas se necessário: `work_shift_alerts.view`, `work_shift_alerts.manage`.

Migrations de catálogo inserem apenas `access_permissions`; nunca `role_permissions` automaticamente. Wildcard `*` permanece compatível.

## 9. Auditoria

Auditar solicitação/aprovação/rejeição/aplicação de ajuste, exportação de relatório, reconhecimento/resolução de alerta e eventual alteração de regra de alerta. Snapshots devem excluir credenciais, dados privados irrelevantes e localização detalhada desnecessária.

## 10. Persistência e migrations

A D-007D provavelmente exigirá tabelas para ajustes e alertas se ainda não materializadas.

Regras: migration versionada/testada; nenhuma migration aplicada em banco real sem autorização; sem grants automáticos; índices por `sessionId`, `userId`, `teamId`, `status`, `detectedAt`, `dedupeKey` e período; JSON sanitizado antes de persistir.

## 11. Contratos tRPC propostos

Ajustes: `workShiftAdjustments.list`, `.request`, `.approve`, `.reject`.

Relatórios: `workShiftReports.overview`, `.sessions`, `.coverage`, `.export`.

Alertas: `workShiftAlerts.list`, `.evaluate` quando exposto de forma restrita, `.acknowledge`, `.resolve`.

O inventário automático de contratos deve continuar falhando quando houver procedure sem classificação/evidência.

## 12. Estratégia de testes

D1: pending com snapshot server-side; bloqueio por escopo/RBAC; aprovação materializa before/after e eventos; rejeição não altera; conflito fail-closed; idempotência; histórico preservado.

D2: filtros e escopo; planejado x realizado consistente com D-007B; sessões ativas/sem fim; exportação auditada; cálculos sem mutação.

D3: casos positivo/negativo dos alertas; deduplicação; acknowledge/resolve idempotentes; escopo; metadata sanitizada; resolução não muta jornada.

D4: composição do painel; RBAC; loading/vazio/erro; responsividade desktop/mobile; regressão D-007C; inventário tRPC e suíte completa.

## 13. Gates por ciclo

Cada D-007D1..D4 segue RED -> GREEN -> regressão -> checkpoint. Antes de declarar ciclo concluído: segurança, TypeScript, Vitest completo, build, GIS visual, NEO externo e NEO workspace. PR técnico temporário para CI nunca será mergeado.

## 14. Não objetivos

Fora da D-007D/Release 1.0: folha; cálculo legal completo; banco de horas complexo; eSocial/ponto externo; biometria; autoencerramento destrutivo; mudança automática de status operacional; Kafka/RabbitMQ apenas para alertas; refatoração D-007C para candidato por usuário; novos épicos.

## 15. Critérios de aceite

D-007D concluída quando ajustes forem auditáveis/seguros, relatórios consultáveis/exportáveis no escopo, alertas deduplicados/gerenciáveis, painel responsivo compuser os três blocos, não houver regressão A/B/C, inventário/evidência estiverem atualizados, quatro gates estiverem verdes no mesmo SHA final e existir checkpoint definitivo, sem migration real/merge/deploy sem autorização.

## 16. Sequência para fechar Release 1.0

`D-007D -> E2E operacional -> carga/estabilidade -> segurança final -> implantação/rollback/smoke -> candidato Release 1.0`.

Nenhum novo épico deve interromper essa sequência.
