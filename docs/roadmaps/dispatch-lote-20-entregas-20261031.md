# AXE Dispatch — lote controlado de 20 entregas da matriz AXED-F001–F100

**Data:** 2026-10-31. **Fonte de escopo:** [100 capacidades](./dispatch-100-capacidades-desdobradas-20261031.md) e [issue #195](https://github.com/jeffaxe81/dispatch/issues/195). Este é um **recorte técnico de execução**, não uma nova lista de funcionalidades. IDs específicos foram priorizados a partir do roadmap já autorizado; não há registro de 20 IDs escolhidos nominalmente pelo solicitante. A seleção pode ser ajustada sem extrapolar a matriz.

**Regra de contagem:** “em implementação” significa commit na branch, **não entregue ou homologado**. “Base existente” significa necessidade de confrontar critério de aceite com a aplicação. Aguardar CI integral (e, se houver SQL/RBAC sensível, homologação específica) antes de integração à main. Nenhuma implantação externa.

| Ordem | ID oficial | Entrega | Frente | Situação auditável | Critério e limitação |
|---:|---|---|---|---|---|
| 1 | AXED-F011 | Tempo real por etapa | R05 | Em implementação na PR | Evento de entrada da etapa consultado apenas para cartões autorizados; sem fallback na abertura. |
| 2 | AXED-F012 | Sinalização de gargalos | R05 | Em implementação na PR | Média de permanência apenas na página e limite configurável; contagem não representa coluna completa. |
| 3 | AXED-F015 | Ordenação por tempo de etapa | R05 | Em implementação parcial na PR | Ordenar cartões da página por evento auditado; ordenação global demanda consulta SQL própria. |
| 4 | AXED-F016 | Motivo obrigatório de priorização | R05 | A aprofundar | Especificar motivo e auditoria da mudança de prioridade, sem duplicar transição de status. |
| 5 | AXED-F017 | Histórico de movimentações | R05 | Base existente a validar | Timeline já existe, mas exposição do autor, estados e acesso no Kanban requer conferência. |
| 6 | AXED-F019 | Visões salvas do Kanban | R05 | Lacuna a implementar | Salvar filtros por usuário/tenant sem armazenar informações de ocorrência. |
| 7 | AXED-F020 | Aviso de alteração concorrente | R05 | Lacuna a implementar | CAS/versionamento da transição, sem aceitar stale writes. |
| 8 | AXED-F021 | Modelo de formulário por categoria | R06 | Base existente a validar | Associar catálogo D-008 a categoria no fluxo autorizado. |
| 9 | AXED-F022 | Campos obrigatórios por fase | R06 | Base existente a validar | Validar transição conforme fase sem bloquear operações existentes inadvertidamente. |
| 10 | AXED-F028 | Pré-preenchimento autorizado | R06 | A aprofundar | Prefill condicionado a permissão de leitura. |
| 11 | AXED-F029 | Revisão por supervisor | R06 | Lacuna a implementar | Parecer e devolução registrados no formulário. |
| 12 | AXED-F030 | Bloqueio por formulário incompleto | R06 | A aprofundar | Gate por fase, explícito e auditável. |
| 13 | AXED-F037 | Passagem de plantão registrada | R07 | Lacuna a implementar | Handoff com responsável e timestamp, sem alterar escala automaticamente. |
| 14 | AXED-F041 | Última lista autorizada offline | R11 | Lacuna a implementar | Cache local seguro com janela limitada e restrição de tenant. |
| 15 | AXED-F042 | Rascunho local de anotações | R11 | Lacuna a implementar | Texto offline sem mudar ocorrência remotamente. |
| 16 | AXED-F045 | Expiração da sessão offline | R11 | Lacuna a implementar | Limite de acesso/expurgo quando sessão vencer. |
| 17 | AXED-F046 | Sincronização sob confirmação | R11 | Lacuna a implementar | Nenhum replay automático sem confirmação. |
| 18 | AXED-F050 | Limpeza de dados locais ao sair | R11 | Lacuna a implementar | Remoção de dados sensíveis no logout. |
| 19 | AXED-F058 | Alerta de posição desatualizada | R10 | Lacuna a implementar | Valor atualizado só com capturedAt válido e limite explícito. |
| 20 | AXED-F097 | Trilha de acessos negados | R08 | Lacuna a implementar | Negativas críticas registradas sem conteúdo sigiloso ou PII. |

## Resumo de execução

- **3/20 em implementação nesta PR**: F011, F012 e F015, com escopo explicitamente parcial em F012 (amostra) e F015 (página, não ordenação global).
- **3/20 com código relacionado a auditar**: não contam como novas entregas, a menos que os critérios faltantes sejam implementados.
- **14/20 aguardam auditoria específica ou implementação**: sem código novo registrado neste lote.
- **0/20 homologadas em ambiente real** por este documento. Suítes de teste e CI não substituem aceite operacional.

### Evidências do primeiro incremento

- Read model [`server/incidentStageMetrics.ts`](../../server/incidentStageMetrics.ts): obtém o `MAX(created_at)` somente de eventos que registram entrada de estado; não usa `createdAt` como substituto. Recebe exclusivamente IDs já filtrados por tenant/permissão.
- [`server/tenantOperational.ts`](../../server/tenantOperational.ts) e [`server/dbLegacy.ts`](../../server/dbLegacy.ts): anexam `stageEnteredAt` a cada página retornada, sem modificar estado ou SLA.
- [`client/src/lib/kanbanQueue.ts`](../../client/src/lib/kanbanQueue.ts) e [`client/src/pages/KanbanPage.tsx`](../../client/src/pages/KanbanPage.tsx): apresentam tempo da etapa, ordenação de cartões por permanência e aviso de gargalo **somente na amostra da página**. Sem dados de evento, exibem “indisponível”.
- A integração ou conclusão permanece condicionada à aprovação de TypeScript, testes, build, segurança, MySQL quando aplicável e revisão dos resultados.

### Fora do escopo

Não incluir 21ª funcionalidade, Contact Center, IA, migração ou grant produtivo, integração externa, mudança automática de status ou qualquer outro tema não listado na matriz. Pedir autorização para novas frentes.
