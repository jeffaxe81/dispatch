# D-007D Migration Sequence Amendment

**Data:** 04/09/2026

## Motivo

Durante a execução da D-007D2 foi confirmado que as permissões `work_shift_reports.view` e `work_shift_reports.export` ainda não existem no catálogo `access_permissions`.

A migration `0005_d007d_work_shift_adjustments.sql` já está congelada no checkpoint homologado `checkpoint/d007d1-work-shift-adjustments-20260904` @ `12c82c1b58f4986ccb17c14686a8018361f0ca9c` e não pode ser alterada retroativamente sem migration drift.

## Sequência corrigida e obrigatória

- `0005_d007d_work_shift_adjustments.sql` — D-007D1, imutável.
- `0006_d007d_work_shift_report_permissions.sql` — D-007D2, somente catálogo `access_permissions` para `work_shift_reports.view` e `work_shift_reports.export`; nenhum `role_permissions`.
- `0007_d007d_work_shift_alerts.sql` — D-007D3, tabela/índices/permissões de alertas; substitui a numeração `0006` prevista originalmente para alertas.

## Impacto no plano

Task 4 passa a criar/testar `0006_d007d_work_shift_report_permissions.sql` e atualizar `drizzle/meta/_journal.json`.

Tasks 5/6 devem usar `0007_d007d_work_shift_alerts.sql` e journal `idx: 7`.

Nenhuma migration deve ser aplicada em banco real sem autorização explícita. Nenhum grant automático a `role_permissions` é permitido.
