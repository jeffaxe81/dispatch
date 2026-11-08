# AXE Despacho — seis frentes incrementais, ciclo 07/11/2026

**Escopo:** central `jeffaxe81/dispatch` e Mobile `jeffaxe81/axe-despacho-mobile`. **Ambiente:** desenvolvimento e pré-produção. Sem autorização de GO.

## Entrega central

| Frente | Implementação | Regressões / aceite | Limite |
| --- | --- | --- | --- |
| 1 — Paginação estável | `incidentListOrder(undefined)` agora desempata pelo ID de ocorrência ao ordenar por data | Testes SQL para todas as ordenações e tie-breaker; nenhuma linha some entre páginas pelo mesmo timestamp | OFFSET continua sujeito a inserções concorrentes; cursor transacional futuro |
| 2 — Pesquisa literal | `incidentLiteralSearchPattern` escapa `%`, `_` e `!` e usa `ESCAPE '!'` com bind SQL no tenant e no legado | Testes de símbolos literais, SQL parametrizado e escopo `organizationId` + equipe antes de LIMIT | Busca com wildcard explícito deixa de existir; validar comportamento com usuários |
| 3 — GPS seguro | `assertRecentTeamLocation` bloqueia horário com mais de 120 s de atraso ou mais de 30 s à frente, após autorização da equipe e antes do banco | Casos de fronteira, relógio inválido, amostra antiga, local do guard no roteador | Não valida GNSS físico, spoofing, antirreplay persistente nem background Android |

## Entrega Mobile (repositório complementar)

| Frente | Implementação | Regressões / aceite | Limite |
| --- | --- | --- | --- |
| 4 — Situação operacional | Indicação clara `ready / warning / busy / blocked`, com rede, sessão, validade, conflitos e atualização | Testes de precedência; sinal é apenas informativo, não substitui a autorização | Avaliar compreensão com agentes reais |
| 5 — Privacidade offline | Cache de resumo só aceita envelope e escopo exatos, timestamps inteiros válidos e TTL de 15 min | Rejeição/expurgo de dados extras, tokens, GPS e relógios alterados | Não oferece operação offline nem reenvio automático |
| 6 — Acessibilidade | Skip link, estado `aria-pressed` das ocorrências, status de rede ao leitor de tela, foco visível, alvo mínimo e redução de movimento | Testes estruturais de marcação e CSS + suíte Mobile | Leitor de tela, contraste e toque devem ser homologados em aparelho real |

## Riscos e próximos passos

1. **P0 integração real:** autenticação PWA/tenant, autorização, transição e revogação na central HTTPS de homologação; não criar rotas anônimas.
2. **P0 Android:** PKCE/Keystore, GPS com foreground service e testes com tela bloqueada continuam dependentes do contrato nativo e de dispositivos reais.
3. **P1 concorrência:** evoluir paginação por cursor/snapshot consistente (a ordenação atual reduz empates, mas não congela novas inserções).
4. **P1 rastreamento:** análise de ritmo e idempotência de GPS no **servidor**; a validação temporal não impede todas as duplicatas ou ataques de replay.
5. **P1 usabilidade:** validar textos e fluxo com agentes, supervisores e acessibilidade humana.
6. **P2 API pública:** gateway REST aberto somente com autenticação, quotas, auditoria e contratos reais aprovados (issue #254).

Não alterar `docs/quality/real-environment-pending-2026-10-23.json` com base em testes sintéticos. O Mobile mantém `docs/quality/mobile-release-gates.json` separado. As novas regressões são verificações específicas; não repetir a afirmação de 10 bilhões para esta PR.
