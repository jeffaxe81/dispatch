# AXE Dispatch — lote controlado de 20 entregas da matriz AXED-F001–F100

**Data:** 2026-10-31. **Fonte de escopo:** [100 capacidades](./dispatch-100-capacidades-desdobradas-20261031.md) e [issue #195](https://github.com/jeffaxe81/dispatch/issues/195). Este é um **recorte técnico de execução**, não uma nova lista de funcionalidades. IDs específicos foram priorizados a partir do roadmap já autorizado; não há registro de 20 IDs escolhidos nominalmente pelo solicitante. A seleção pode ser ajustada sem extrapolar a matriz.

**Regra de contagem:** “em implementação” significa commit na branch, **não entregue ou homologado**. “Base existente” significa necessidade de confrontar critério de aceite com a aplicação. Aguardar CI integral (e, se houver SQL/RBAC sensível, homologação específica) antes de integração à main. Nenhuma implantação externa.

| Ordem | ID oficial | Entrega | Frente | Situação auditável | Critério e limitação |
|---:|---|---|---|---|---|
| 1 | AXED-F011 | Tempo real por etapa | R05 | Integrado — #208 | Evento de entrada por etapa consultado para cartões autorizados, sem fallback em abertura. |
| 2 | AXED-F012 | Sinalização de gargalos | R05 | Integrado parcialmente — #208 | Alerta configurável usa média da página; agregação global da etapa ainda pendente. |
| 3 | AXED-F015 | Ordenação por tempo de etapa | R05 | Integrado parcialmente — #208 | Ordenação por permanência só na página; SQL global pendente. |
| 4 | AXED-F016 | Motivo obrigatório de priorização | R05 | Integrado — #212 | Justificativa de mudança de prioridade exigida pela API e registrada em auditoria. |
| 5 | AXED-F017 | Histórico de movimentações | R05 | Integrado — #210 | Cronologia mostra autor, horário e estado anterior → novo nos eventos aplicáveis. |
| 6 | AXED-F019 | Visões salvas do Kanban | R05 | Integrado — #211 | Visões locais isoladas por usuário e organização ativa neste dispositivo. |
| 7 | AXED-F020 | Aviso de alteração concorrente | R05 | Integrado parcialmente — #213 | Bloqueio transacional e confronto de situação esperada; revisão monotônica/ABA pendente. |
| 8 | AXED-F021 | Modelo de formulário por categoria | R06 | Integrado — #214 | Herda modelo publicado pela categoria derivada da ocorrência e tenant autorizados. |
| 9 | AXED-F022 | Campos obrigatórios por fase | R06 | Integrado — #218 | Campos D-008 condicionados à fase obtida da ocorrência autorizada; F030 separado. |
| 10 | AXED-F028 | Pré-preenchimento autorizado | R06 | Integrado — #216 | Ação explícita preenche apenas código, categoria e prioridade, sem PII ou sobrescrita. |
| 11 | AXED-F029 | Revisão por supervisor | R06 | Lacuna a implementar | Parecer e devolução registrados no formulário. |
| 12 | AXED-F030 | Bloqueio por formulário incompleto | R06 | A aprofundar | Gate por fase, explícito e auditável. |
| 13 | AXED-F037 | Passagem de plantão registrada | R07 | Lacuna a implementar | Handoff com responsável e timestamp, sem alterar escala automaticamente. |
| 14 | AXED-F041 | Última lista autorizada offline | R11 | Lacuna a implementar | Cache local seguro com janela limitada e restrição de tenant. |
| 15 | AXED-F042 | Rascunho local de anotações | R11 | Lacuna a implementar | Texto offline sem mudar ocorrência remotamente. |
| 16 | AXED-F045 | Expiração da sessão offline | R11 | Lacuna a implementar | Limite de acesso/expurgo quando sessão vencer. |
| 17 | AXED-F046 | Sincronização sob confirmação | R11 | Lacuna a implementar | Nenhum replay automático sem confirmação. |
| 18 | AXED-F050 | Limpeza de dados locais ao sair | R11 | Integrado — #217 | Expurgo de cache antigo de usuário, chave de empresa, visões Kanban e dados offline no logout. |
| 19 | AXED-F058 | Alerta de posição desatualizada | R10 | Integrado — #209 | Sinaliza localização antiga, ausente ou sem horário confiável em mapas. |
| 20 | AXED-F097 | Trilha de acessos negados | R08 | Lacuna a implementar | Negativas críticas registradas sem conteúdo sigiloso ou PII. |

## Resumo de execução verificado — 31/10/2026

- **20/20 IDs mapeados**; os 20 foram selecionados do roadmap de 100 já autorizado.
- **12/20 IDs com código integrado à `main` (60%)** após PRs #208–#214 e #216–#218, todas aprovadas com 7/7 checks.
- **9/20 implementações integradas no escopo declarado**: F011, F016, F017, F019, F021, F022, F028, F050 e F058.
- **3/20 integradas parcialmente**: F012 (média amostral por página), F015 (ordem por página) e F020 (conflito por status, sem revisão monotônica/ABA).
- **8/20 ainda sem entrega integrada**: F029, F030, F037, F041, F042, F045, F046 e F097.
- **0/20 homologadas em produção por esta matriz**. CI e ensaios MySQL descartáveis não substituem aceite operacional nem liberam DISPATCH-REAL-01/02/03. A CI pós-merge na main é independente da CI das PRs.

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

### Condição expressa para fechar a release

Fechar o lote somente quando os **8 IDs ainda pendentes** estiverem implementados e com critérios de aceite atendidos, e as **3 implementações parciais** estiverem finalizadas, seguida de regressão integrada, evidência de segurança por tenant e aceite operacional. A autorização de fechamento condicional está na [issue #195](https://github.com/jeffaxe81/dispatch/issues/195). **Fechamento administrativo não autoriza implantação em produção.**

### Evidências do primeiro incremento

- Read model [`server/incidentStageMetrics.ts`](../../server/incidentStageMetrics.ts): obtém o `MAX(created_at)` somente de eventos que registram entrada de estado; não usa `createdAt` como substituto. Recebe exclusivamente IDs já filtrados por tenant/permissão.
- [`server/tenantOperational.ts`](../../server/tenantOperational.ts) e [`server/dbLegacy.ts`](../../server/dbLegacy.ts): anexam `stageEnteredAt` a cada página retornada, sem modificar estado ou SLA.
- [`client/src/lib/kanbanQueue.ts`](../../client/src/lib/kanbanQueue.ts) e [`client/src/pages/KanbanPage.tsx`](../../client/src/pages/KanbanPage.tsx): apresentam tempo da etapa, ordenação de cartões por permanência e aviso de gargalo **somente na amostra da página**. Sem dados de evento, exibem “indisponível”.
- A integração ou conclusão permanece condicionada à aprovação de TypeScript, testes, build, segurança, MySQL quando aplicável e revisão dos resultados.

### Fora do escopo

Não incluir 21ª funcionalidade, Contact Center, IA, migração ou grant produtivo, integração externa, mudança automática de status ou qualquer outro tema não listado na matriz. Pedir autorização para novas frentes.
