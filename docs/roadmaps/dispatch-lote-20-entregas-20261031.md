# AXE Dispatch — lote controlado de 20 entregas da matriz AXED-F001–F100

**Data:** 2026-10-31. **Fonte de escopo:** [100 capacidades](./dispatch-100-capacidades-desdobradas-20261031.md) e [issue #195](https://github.com/jeffaxe81/dispatch/issues/195). Este é um **recorte técnico de execução**, não uma nova lista de funcionalidades. IDs específicos foram priorizados a partir do roadmap já autorizado; não há registro de 20 IDs escolhidos nominalmente pelo solicitante. A seleção pode ser ajustada sem extrapolar a matriz.

**Regra de contagem:** “em implementação” significa commit na branch, **não entregue ou homologado**. “Base existente” significa necessidade de confrontar critério de aceite com a aplicação. Aguardar CI integral (e, se houver SQL/RBAC sensível, homologação específica) antes de integração à main. Nenhuma implantação externa.

| Ordem | ID oficial | Entrega | Frente | Situação auditável | Critério e limitação |
|---:|---|---|---|---|---|
| 1 | AXED-F011 | Tempo real por etapa | R05 | Integrado — #208 | Evento de entrada por etapa consultado para cartões autorizados, sem fallback em abertura. |
| 2 | AXED-F012 | Sinalização de gargalos | R05 | Integrado com ressalva — #208, #230 | Média global por coluna com cobertura exibida. Ressalva: o limite é ajustável na tela (padrão 120 min), mas não é persistido. |
| 3 | AXED-F015 | Ordenação por tempo de etapa | R05 | Integrado — #208, #228 | Ordenação global aplicada antes da paginação. |
| 4 | AXED-F016 | Motivo obrigatório de priorização | R05 | Integrado — #212 | Justificativa de mudança de prioridade exigida pela API e registrada em auditoria. |
| 5 | AXED-F017 | Histórico de movimentações | R05 | Integrado — #210 | Cronologia mostra autor, horário e estado anterior → novo nos eventos aplicáveis. |
| 6 | AXED-F019 | Visões salvas do Kanban | R05 | Integrado — #211 | Visões locais isoladas por usuário e organização ativa neste dispositivo. |
| 7 | AXED-F020 | Aviso de alteração concorrente | R05 | Integrado com ressalva — #213, #233 | Revisão monotônica sob lock de linha protege contra ABA; Kanban, detalhe e agente enviam a revisão. Ressalvas: a API ainda aceita chamadas sem revisão (compatibilidade) e `updateIncident` não usa revisão nem lock de linha. |
| 8 | AXED-F021 | Modelo de formulário por categoria | R06 | Integrado — #214 | Herda modelo publicado pela categoria derivada da ocorrência e tenant autorizados. |
| 9 | AXED-F022 | Campos obrigatórios por fase | R06 | Integrado — #218 | Campos D-008 condicionados à fase obtida da ocorrência autorizada; F030 separado. |
| 10 | AXED-F028 | Pré-preenchimento autorizado | R06 | Integrado — #216 | Ação explícita preenche apenas código, categoria e prioridade, sem PII ou sobrescrita. |
| 11 | AXED-F029 | Revisão por supervisor | R06 | Integrado — #231 | Aceite ou devolução com motivo, histórico transacional por revisão e interface. |
| 12 | AXED-F030 | Bloqueio por formulário incompleto | R06 | Integrado com ressalva — #225, #232 | Gate transacional na conclusão, com escopo de tenant. Ressalvas: cobre apenas a fase `concluida`, a tentativa bloqueada não gera registro de auditoria e não há teste do gate contra MySQL real. |
| 13 | AXED-F037 | Passagem de plantão registrada | R07 | Integrado — #222 | Handoff com solicitação, confirmação e auditoria; há workflow de homologação em MySQL descartável, cujo resultado não foi consultado nesta reconciliação. |
| 14 | AXED-F041 | Última lista autorizada offline | R11 | Integrado — #223 | Resumo minimizado em `sessionStorage`, com expiração de 15 min e isolamento por identidade. |
| 15 | AXED-F042 | Rascunho local de anotações | R11 | Integrado — #223 | Rascunho salvo localmente, sem envio; a restauração exige ação operacional separada. |
| 16 | AXED-F045 | Expiração da sessão offline | R11 | Integrado — #223 | Dado expirado ou fora do escopo é rejeitado na leitura. |
| 17 | AXED-F046 | Sincronização sob confirmação | R11 | Integrado com ressalva — #227, #229, #234 | Bloqueio de envios offline, revalidação após reconexão e comparação manual. Ressalva: não há fila de operações pendentes; ações são refeitas manualmente, sem replay. |
| 18 | AXED-F050 | Limpeza de dados locais ao sair | R11 | Integrado — #217 | Expurgo de cache antigo de usuário, chave de empresa, visões Kanban e dados offline no logout. |
| 19 | AXED-F058 | Alerta de posição desatualizada | R10 | Integrado — #209 | Sinaliza localização antiga, ausente ou sem horário confiável em mapas. |
| 20 | AXED-F097 | Trilha de acessos negados | R08 | Integrado — #221 | Registra código de permissão normalizado, sem dados da requisição; falha no registro não concede acesso. |

## Resumo de execução verificado — 05/11/2026

Reconciliado com o commit `593b43b` da `main`.

- **20/20 IDs com código integrado à `main`**.
- **16/20 integrados no escopo declarado**: F011, F015, F016, F017, F019, F021, F022, F028, F029, F037, F041, F042, F045, F050, F058 e F097.
- **4/20 integrados com ressalva a decidir**: F012, F020, F030 e F046, conforme a matriz.
- **0/20 homologadas em produção por esta matriz**. CI e ensaios MySQL descartáveis não substituem aceite operacional nem liberam DISPATCH-REAL-01/02/03. A CI pós-merge na main é independente da CI das PRs.

### Regressão local — 05/11/2026 (Windows, Node 24, `593b43b`)

| Etapa | Resultado |
|---|---|
| `pnpm security:check` | Aprovado |
| `pnpm check` | Aprovado |
| `pnpm test` | 3003/3012 aprovados; 9 falhas classificadas abaixo |
| `pnpm readiness:dispatch` | `NO_GO`: 0/3 gates evidenciados (DISPATCH-REAL-01/02/03) |
| `node --test scripts/inventory-external-preflight.test.mjs` | 5/5 aprovados |
| `pnpm build` | Aprovado |
| Empacotamento Docker | Não executado: Docker indisponível na máquina |

| Falhas em `pnpm test` | Causa | Comprovação |
|---|---|---|
| `embeddedAppCsp` (1) | Teste espera LF; checkout local em CRLF | Aprovado em cópia LF do `HEAD` |
| `workShiftOperationalPublishing` (2), `GeneralSettingsPage` (1), `WorkflowBuilderPage.full` (1) | Lentidão sob a suíte completa | Aprovados isolados em cópia LF do `HEAD` |
| `workflowEventTriggerPersistence` (1), `workflowFormHardening` (1) | Importação lenta excede o limite de 5 s | Aprovados com limite maior (3,9 s e 3,4 s) |
| `recovery/cli` (1) | `EPERM` ao criar symlink no Windows | Causa indicada pelo erro; **não reexecutado em Linux** |
| `recovery/manifest` (1) | `/proc/self/fd` inexistente no Windows | Causa indicada pelo erro; **não reexecutado em Linux** |

Esta regressão não substitui a CI: a situação da CI pós-merge na `main` não foi consultada nesta reconciliação.

### Registro de PRs e mudanças

| ID(s) | Evidência | Situação |
|---|---|---|
| F011, F012, F015 | [PR #208](https://github.com/jeffaxe81/dispatch/pull/208), `023b401` | Integrada — F012 e F015 parciais |
| F058 | [PR #209](https://github.com/jeffaxe81/dispatch/pull/209), `c8e5b8c` | Integrada |
| F017 | [PR #210](https://github.com/jeffaxe81/dispatch/pull/210), `23d212c` | Integrada |
| F019 | [PR #211](https://github.com/jeffaxe81/dispatch/pull/211), `7b5bfa7` | Integrada |
| F016 | [PR #212](https://github.com/jeffaxe81/dispatch/pull/212), `9460a72` | Integrada |
| F020 | [PR #213](https://github.com/jeffaxe81/dispatch/pull/213), `d8e2943` | Integrada parcialmente |
| F021 | [PR #214](https://github.com/jeffaxe81/dispatch/pull/214), `b063da2` | Integrada |
| F028 | [PR #216](https://github.com/jeffaxe81/dispatch/pull/216), `40c22d1` | Integrada |
| F050 | [PR #217](https://github.com/jeffaxe81/dispatch/pull/217), `0389bc2` | Integrada |
| F022 | [PR #218](https://github.com/jeffaxe81/dispatch/pull/218), `353939a` | Integrada |
| F097 | [PR #221](https://github.com/jeffaxe81/dispatch/pull/221), `8323e56` | Integrada |
| F037 | [PR #222](https://github.com/jeffaxe81/dispatch/pull/222), `47f80cf` | Integrada |
| F041, F042, F045 | [PR #223](https://github.com/jeffaxe81/dispatch/pull/223), `dc31dd7` | Integrada |
| F030 | [PR #225](https://github.com/jeffaxe81/dispatch/pull/225), `db43da8`; [PR #232](https://github.com/jeffaxe81/dispatch/pull/232), `54121b0` | Integrada com ressalva |
| F046 | [PR #227](https://github.com/jeffaxe81/dispatch/pull/227), `c0f1d72`; [PR #229](https://github.com/jeffaxe81/dispatch/pull/229), `7ec3a38`; [PR #234](https://github.com/jeffaxe81/dispatch/pull/234), `593b43b` | Integrada com ressalva |
| F015 | [PR #228](https://github.com/jeffaxe81/dispatch/pull/228), `5cc3509` | Integrada |
| F012 | [PR #230](https://github.com/jeffaxe81/dispatch/pull/230), `7f52e64` | Integrada com ressalva |
| F029 | [PR #231](https://github.com/jeffaxe81/dispatch/pull/231), `aea6584` | Integrada |
| F020 | [PR #233](https://github.com/jeffaxe81/dispatch/pull/233), `380a5d5` | Integrada com ressalva |

### Condição expressa para fechar a release

Fechar o lote somente após decidir as **4 ressalvas** (F012, F020, F030 e F046), seguida de CI integral, evidência de segurança por tenant e aceite operacional. A autorização de fechamento condicional está na [issue #195](https://github.com/jeffaxe81/dispatch/issues/195). **Fechamento administrativo não autoriza implantação em produção.**

### Evidências do primeiro incremento

- Read model [`server/incidentStageMetrics.ts`](../../server/incidentStageMetrics.ts): obtém o `MAX(created_at)` somente de eventos que registram entrada de estado; não usa `createdAt` como substituto. Recebe exclusivamente IDs já filtrados por tenant/permissão.
- [`server/tenantOperational.ts`](../../server/tenantOperational.ts) e [`server/dbLegacy.ts`](../../server/dbLegacy.ts): anexam `stageEnteredAt` a cada página retornada, sem modificar estado ou SLA.
- [`client/src/lib/kanbanQueue.ts`](../../client/src/lib/kanbanQueue.ts) e [`client/src/pages/KanbanPage.tsx`](../../client/src/pages/KanbanPage.tsx): apresentam tempo da etapa, ordenação de cartões por permanência e aviso de gargalo **somente na amostra da página**. Sem dados de evento, exibem “indisponível”.
- A integração ou conclusão permanece condicionada à aprovação de TypeScript, testes, build, segurança, MySQL quando aplicável e revisão dos resultados.

### Fora do escopo

Não incluir 21ª funcionalidade, Contact Center, IA, migração ou grant produtivo, integração externa, mudança automática de status ou qualquer outro tema não listado na matriz. Pedir autorização para novas frentes.
