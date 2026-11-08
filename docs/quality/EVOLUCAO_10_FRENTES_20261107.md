# AXE Despacho — 10 frentes incrementais (ciclo 2026-11-07)

**Escopo de CI:** Web e Mobile, duas PRs independentes. **Produção: NO-GO.** Nenhum login real, GPS em celular físico, integração de operadora, dados do cidadão ou implantação operacional foi utilizado neste ciclo.

A ordem das frentes não implica aprovação, nem trabalho executado simultaneamente por pessoas distintas. Todas são alterações **codificadas sob validação CI** até o merge. A conclusão dos respectivos refinamentos depende de evidências específicas.

| Frente | Área | Entrega deste ciclo | Prova pretendida |
| --- | --- | --- | --- |
| F01 | RBAC | Reativação de papel valida prazo, QA stage, base admin, existência e tenant da equipe antes de alterar perfis/sessões | `roleReactivationGuard.test.ts` e regressão de ordem transacional |
| F02 | Multi-tenant | Header de empresa exige ID canônico positivo, sem zeros à esquerda, múltiplos valores ou cabeçalho vazio | `tenantHeaderCanonical.test.ts` |
| F03 | Ocorrências/desempenho | Limite de 100 mil páginas na listagem evita OFFSET arbitrariamente profundo enquanto não há keyset/cursor | `incidentListValidation.test.ts` |
| F04 | GPS/privacidade | Mantém gravação de localização, mas não copia latitude/longitude exatas para o audit log | `tenFrontSecurityRegression.test.ts` |
| F05 | Relatórios/privacidade | Preserva nomes de filtros salvos no recurso, mas não em snapshots do audit log | `tenFrontSecurityRegression.test.ts` |
| F06 | Rastreabilidade | Atualiza inventário dos 100 IDs: R013 integrado na PR #262; R009 e R014 codificados; demais ainda pendentes | `refinementBacklog.test.ts` |
| F07 | Mobile/offline | Reconciliação exige somente os quatro campos canônicos, com código/status/categoria validados | CI Mobile `agentOfflineReconcile.test.ts` |
| F08 | Mobile/tenant | Rejeita DTO com campos inesperados, segredos adicionais ou códigos de organização duplicados | CI Mobile `tenantSelectionValidation.test.ts` |
| F09 | Mobile/API | Mensagens HTTP 401/403/5xx genéricas, sem ecoar texto de backend potencialmente sensível nem fazer retry de mutação | CI Mobile `apiSafeErrors.test.ts` |
| F10 | Mobile/UX | Controles essenciais com toque mínimo 44 px e barra superior com reflow em telas de 375 px | CI Mobile `mobileAccessibilityContract.test.ts` |

## Critérios de aceite desta rodada

- Cada repositório precisa passar sua CI (TypeScript, testes, build e demais jobs exigidos).
- O guarda de reativação QA é validado dentro da mesma transação e antes da substituição dos vínculos; os tokens existentes continuam revogados em alteração válida.
- Logs auditáveis exibem metadados minimizados; a remoção de campos de outros loggers ainda exige inspeção própria, de modo que **R097 permanece pendente**.
- O limite de página é apenas defesa contra consultas excessivamente profundas; **R083 e R082 ainda exigem medições SQL/P95 reais**, cursor de paginação e ajustes de banco.
- O teste de header não substitui a validação de isolamento com duas bases/tenants de campo.
- O CSS tem teste estrutural, não teste visual em aparelho. **R061/R067 não ficam 100% homologados** sem navegadores/dispositivos reais.
- **REAL-01/02/03 = 0/3 e Mobile real gates pendentes**. Não alterar flags de produção ou concluir F04/F05/F06 por CI sintética.

## Pendências fora deste ciclo

Sessões cross-node, cookies SameSite/iframes NEO (#239), auditoria ampla de filtros por organização sem `organizationId` persistido (R019), mobilidade nativa Android PKCE/App Links/Keystore e ensaios de campo.
