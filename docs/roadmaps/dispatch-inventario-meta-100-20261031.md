# AXE Despacho — conferência da meta de 100 novas funcionalidades

Data: 2026-10-31. Base: `jeffaxe81/dispatch`, roadmap ampliado da issue #195, roadmap original #123 e `todo.md`.

## Limite de escopo

O roadmap ampliado #195 descreve **22 frentes macro**, e não 100 funcionalidades novas distintas. Parte do escopo já possui código e testes; outra parte trata de **homologação, gates, segurança e deploy**, que não são funcionalidades de produto. Portanto, **não existe base para afirmar que 100 novas funcionalidades estão disponíveis para entrega**. Faltam ao menos **78 descrições** para que a meta de 100 seja sequer especificada no mesmo nível de granularidade das 22 frentes; a diferença real de funcionalidades novas é maior, já que diversas frentes não são funcionalidades.

A lista abaixo é um espelho rastreável do roadmap #195, **não** uma promessa de implementação. Na ausência de evidência independente, o estado é `verificar`.

| ID | Mês | Frente descrita no roadmap #195 | Categoria | Estado |
|---|---|---|---|---|
| R01 | 1 | Consolidar D-012I/D-012J já integrados | Consolidação | Verificar |
| R02 | 1 | Regressão de CAS/fencing/retry/outbox/DLQ | Testes | Verificar |
| R03 | 1 | Fechar pendências técnicas demonstráveis em CI | Qualidade | Verificar |
| R04 | 1 | Manter REAL-01/02/03 em NO-GO até evidência externa | Gate | Pendente de evidência externa |
| R05 | 2 | Painel SLA e Kanban operacional | Funcional | Parcial: Kanban existente; melhorias de triagem na PR desta entrega |
| R06 | 2 | Formulários D-008 em fluxo real | Funcional | Verificar |
| R07 | 2 | Jornada e cobertura | Funcional | Verificar |
| R08 | 2 | E2E operador, despachador, agente, RBAC e tenant | Testes | Parcial automatizado; campo pendente |
| R09 | 3 | Observabilidade e resposta a incidentes | Funcional/Operação | Verificar |
| R10 | 3 | GIS degradado e failover | Funcional | Verificar |
| R11 | 3 | Campo e sincronização segura | Funcional | Verificar |
| R12 | 3 | Backup, restore e rollback isolados | Gate | Verificar ambiente |
| R13 | 4 | NEO, CRM e Inventário: contratos versionados | Integração | Verificar |
| R14 | 4 | Idempotência, circuit breaker, replay autorizado e fail-closed | Integração | Verificar |
| R15 | 4 | Isolamento entre bancos e tenants | Segurança | Verificar |
| R16 | 4 | Testes de falha e compatibilidade | Testes | Verificar |
| R17 | 5 | DISPATCH-REAL-01/02/03 e evidências sanitizadas | Gate real | Pendente |
| R18 | 5 | Manifesto e evidências com validação automatizada | Qualidade | Verificar |
| R19 | 5 | Riscos residuais e rollback | Gate | Verificar |
| R20 | 5 | Regressão completa, segurança, carga e perfis | Testes | Verificar |
| R21 | 5 | Release candidate e decisão humana GO/GO COM RESSALVAS/NO-GO | Gate | Pendente |
| R22 | 5 | Gate separado para deploy, migration, grants e merge | Governança | Pendente |

## Itens explícitos não concluídos em `todo.md`

- D-006: homologação de sessão, login e cookies no iframe NEO.
- D-006: homologação de NEO Interact em ambiente autorizado.
- D-007D: administração avançada, relatórios, alertas e ajustes de jornada.

Esses itens podem se sobrepor às frentes R07 e R13 e **não** devem ser somados para inflar a contagem. A issue #198 também descreve uma frente específica de auditoria tenant-scoped que demanda projeto e validação próprios, sem reutilização implícita da PR #197.

## Microentrega atual na frente R05

- Filtro de prioridade do Kanban conectado ao parâmetro já existente da API.
- Busca por código ou categoria conectada ao parâmetro já existente da API.
- Ordenação dos cartões por criticidade e por data de abertura.
- Indicação do tempo desde a **abertura** da ocorrência e aviso de paginação quando houver mais de 100 registros.
- Sem mutação automática de ocorrência, reatribuição, novo grant ou integração externa.
- **Não** representa apuração de tempo em cada etapa, nem implementação integral da frente R05.

## Critérios de contagem

1. Nenhuma homologação ou CI deve ser contabilizada como funcionalidade nova.
2. Nenhum item `verificar` deve ser considerado entregue sem confirmação técnica.
3. Não decompor artificialmente uma mesma capacidade em dezenas de nomes apenas para atingir 100.
4. Para chegar a 100, é necessária **expansão aprovada do roadmap** com funcionalidades distintas e critérios de aceite.
5. Produção, migrations, notificações externas e dados reais permanecem fora deste ciclo.
