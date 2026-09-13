# D-012 — Workflow / Automação Operacional — Design

Data: 2026-09-13
Status: design aprovado em direção; aguardando revisão formal da especificação antes do plano de implementação
Base: `main` em `03ed106ce18b42d48df1a0f9032d8d6548af671c`
Branch documental: `docs/d012-workflow-automation-design-20260913`

## 1. Objetivo

Criar um motor de Workflow/Automação reutilizável para o AXE Dispatch, capaz de coordenar etapas, tarefas, regras e eventos operacionais sem duplicar o módulo D-008 de Formulários Dinâmicos / No-Code e sem introduzir escrita cruzada em bancos de outros produtos.

O D-012 deve permitir iniciar fluxos manualmente ou a partir de eventos autorizados, acompanhar instâncias, atribuir tarefas, aplicar condições básicas, exigir formulários D-008 em etapas específicas, auditar transições e fornecer uma base segura para automações futuras.

A primeira release não pretende implementar um motor BPMN 2.0 completo. O modelo será deliberadamente simples, versionado e extensível, permitindo futura exportação/adaptação para BPMN sem carregar agora a complexidade de um engine BPMN integral.

## 2. Contexto existente que deve ser reutilizado

- D-008 já fornece designer e runtime de Formulários Dinâmicos / No-Code, versionamento, submissões, auditoria e eventos de domínio.
- D-010 já fornece Workspace Operacional e catálogo de widgets, incluindo Kanban e formulário dinâmico.
- D-011 já fornece padrões de observabilidade, health, evidência e comportamento fail-closed.
- O núcleo operacional já possui isolamento multi-tenant por organização ativa.
- O Motor de Ativos/Inventário usa integração por REST/eventos versionados, sem escrita cruzada em banco; D-012 deve seguir o mesmo princípio.

## 3. Abordagens consideradas

### A. Workflow acoplado diretamente às tabelas de Ocorrência

Mais rápido no início, porém cria forte dependência entre regras de workflow e o domínio crítico do Despacho. Rejeitado.

### B. Serviço independente desde a primeira versão

Excelente isolamento futuro, mas aumenta cedo demais a complexidade de deploy, autenticação, observabilidade, retries, contratos e consistência distribuída.

### C. Módulo isolado dentro do Dispatch com contratos de eventos — selecionado

O motor nasce dentro do repositório atual, mas com fronteira própria: contratos, store/repositório, engine e APIs separados. Ele consome eventos versionados e publica eventos próprios. Não lê/escreve diretamente tabelas de outros produtos. Essa abordagem reduz risco e deixa preparada uma futura extração para serviço independente.

## 4. Modelo funcional inicial

Entidades principais:

- `WorkflowDefinition`: identidade lógica do fluxo.
- `WorkflowVersion`: versão imutável publicada.
- `WorkflowStep`: etapa/nó do fluxo.
- `WorkflowTransition`: transição permitida entre etapas.
- `WorkflowInstance`: execução concreta de uma versão publicada.
- `WorkflowTask`: trabalho humano ou operacional associado a uma etapa.
- `WorkflowEvent`: evento auditável recebido/emitido pelo motor.
- `WorkflowAction`: ação controlada produzida por uma transição.

Estados mínimos da definição: `draft`, `published`, `disabled`.

Estados mínimos da instância: `running`, `waiting`, `completed`, `cancelled`, `failed`.

Estados mínimos da tarefa: `open`, `in_progress`, `completed`, `cancelled`.

Versões publicadas são imutáveis. Alterações posteriores criam nova versão, preservando instâncias antigas no contrato original.

## 5. Regras arquiteturais

- Tenant/organização sempre derivado do contexto autenticado ou envelope confiável; nunca de campo arbitrário do cliente.
- Toda instância pertence exatamente a um tenant.
- Toda transição registra ator, origem, destino, timestamp e `correlationId`.
- Eventos externos possuem `eventId` e versão para idempotência/fail-closed.
- Replays não podem produzir efeito duplicado.
- Condições usam allowlist de operadores e campos; não haverá execução arbitrária de JavaScript/SQL.
- Ações externas são executadas por adapters explícitos; nada de URL/comando arbitrário no designer.
- Estado crítico de Ocorrência não será alterado automaticamente na primeira release. O Workflow poderá produzir uma intenção/comando sujeito ao gate já existente no domínio responsável.
- Sem consultas cruzadas entre bancos de produtos.
- Sem deploy, migration ou grant produtivo automático.

## 6. Integração com D-008 Formulários

O D-012 não cria novo designer de formulários.

Uma etapa de workflow poderá referenciar `formDefinitionId`/`formVersionId` do D-008 e definir uma política como:

- opcional;
- obrigatório antes de concluir a tarefa;
- obrigatório antes de determinada transição.

O Workflow somente acompanha referência/estado da submissão. O conteúdo e a integridade da resposta continuam sob ownership do D-008.

Eventos do D-008, como submissão enviada ou corrigida, poderão alimentar gatilhos do D-012 por contrato versionado.

## 7. Designer No-Code do Workflow

O designer inicial trabalhará com um grafo controlado, não BPMN completo.

Elementos iniciais:

- início;
- tarefa humana;
- espera por evento;
- decisão/condição;
- etapa de formulário D-008;
- fim.

Configurações iniciais:

- nome e descrição;
- responsável por usuário, equipe ou papel;
- transições permitidas;
- condições simples;
- formulário associado;
- prioridade;
- prazo/SLA opcional;
- gatilho manual ou evento permitido.

Não será permitido código, script, SQL, shell, URL arbitrária ou plugin remoto no designer.

## 8. Microentregas aprovadas para planejamento

### D-012A — Fronteira e contratos

Criar contratos versionados, tipos centrais, envelopes de evento, regras de tenant/correlation/idempotência e teste arquitetural que impeça acoplamento indevido.

**Saída:** fundação sem regra operacional e sem migration aplicada.

### D-012B — Definição, versão e publicação

Criar domínio de `WorkflowDefinition`/`WorkflowVersion`, edição de rascunho, validação do grafo, publicação imutável e criação de nova versão.

**Saída:** workflow pode ser definido e publicado, mas ainda não executado.

### D-012C — Engine de instância e máquina de estados

Criar `WorkflowInstance`, início manual controlado, etapa atual, transições válidas, conclusão/cancelamento e fail-closed para transições inválidas.

**Saída:** primeiro fluxo executável sem tarefas e sem automação externa.

### D-012D — Tarefas e responsáveis

Criar `WorkflowTask`, atribuição por usuário/equipe/papel, claim/start/complete, regras de concorrência e histórico.

**Saída:** workflow humano operacional utilizável.

### D-012E — RBAC e Multi-tenant

Aplicar permissões específicas de workflow, organização ativa, escopo operacional e testes negativos tenant A/B em definições, versões, instâncias e tarefas.

**Saída:** isolamento formal antes de automações por evento.

### D-012F — Eventos e gatilhos

Consumir eventos versionados autorizados do Despacho/D-008/Inventário, com deduplicação por `tenantId + eventId`, `correlationId`, compatibilidade de versão e fail-closed.

**Saída:** criação/avanço de workflow por eventos controlados.

### D-012G — Condições No-Code

Implementar regras declarativas simples com allowlist: igualdade, diferença, presença, comparação numérica/data e composição `all/any`, sempre sobre campos explicitamente expostos ao Workflow.

**Saída:** gateways/decisões básicas sem linguagem de script.

### D-012H — Integração com Formulários D-008

Permitir etapa/tarefa com formulário obrigatório, acompanhar status da submissão e bloquear transição quando o requisito não estiver satisfeito.

**Saída:** Workflow + Formulários conectados por referência e eventos, sem duplicação de ownership.

### D-012I — Prazos, SLA e escalonamento seguro

Adicionar prazo de tarefa/etapa, estado de vencimento, lembretes/eventos de SLA e escalonamento de responsabilidade. Nenhuma alteração automática de estado crítico da ocorrência.

**Saída:** controle temporal do fluxo.

### D-012J — Designer visual de Workflow

Criar UI no-code para montar o grafo usando apenas os elementos permitidos, validar inconsistências antes da publicação e apresentar versão/estado claramente.

**Saída:** administrador consegue criar o fluxo sem editar JSON.

### D-012K — Caixa de tarefas e Kanban operacional

Integrar tarefas do Workflow ao Workspace D-010: fila pessoal/equipe, Kanban, filtros por prioridade/SLA e abertura do contexto de ocorrência/formulário/ativo quando autorizado.

**Saída:** experiência operacional para operador e supervisor.

### D-012L — Auditoria, observabilidade e recovery

Padronizar logs estruturados, métricas, `correlationId`, eventos de auditoria, health do módulo e procedimentos de recuperação, alinhados ao D-011.

**Saída:** rastreabilidade ponta a ponta.

### D-012M — Hardening, regressão e release candidate

Executar regressão completa, carga mínima, testes de replay, concorrência, tenant, falhas de consumidor, build/Docker e documentação de rollback. Preparar release candidate sem deploy produtivo automático.

**Saída:** candidato de release D-012 com decisão Go/No-Go separada.

## 9. Ordem e gates

Ordem padrão: `A → B → C → D → E → F → G → H → I → J → K → L → M`.

Cada microentrega deve:

1. partir de `main` atualizada ou checkpoint aprovado;
2. criar checkpoint antes da implementação relevante;
3. seguir TDD RED → GREEN;
4. ter diff restrito ao escopo;
5. passar segurança, TypeScript, testes e build;
6. executar gates visuais quando houver UI;
7. documentar decisões e rollback;
8. somente integrar após aprovação explícita.

Microentregas independentes podem ser revisadas em paralelo, mas a integração respeita dependências de contrato.

## 10. Critérios de aceite da primeira release D-012

- Workflow publicado é imutável e versionado.
- Instâncias antigas preservam sua versão original.
- Usuário/equipe consegue receber e concluir tarefas autorizadas.
- Tenant A não lê nem altera objetos do tenant B.
- Eventos repetidos são idempotentes.
- Versão de evento incompatível falha fechado.
- Condições usam somente operadores/campos permitidos.
- Formulário D-008 obrigatório bloqueia transição até submissão válida.
- Falha de integração não paralisa o núcleo do Despacho.
- Toda transição/tarefa relevante é auditável e correlacionável.
- Designer não permite execução arbitrária de código ou endpoints.
- Nenhuma automação altera estado crítico da ocorrência sem passar pelo contrato/gate do domínio responsável.
- Gates automatizados e rollback ficam GREEN/documentados antes de release.

## 11. Fora do escopo desta primeira release

- engine BPMN 2.0 completo;
- execução arbitrária de scripts;
- editor de código;
- SQL configurável pelo usuário;
- webhooks para URL arbitrária;
- automação produtiva de restart/failover/deploy;
- IA gerando e publicando workflow sem revisão humana;
- mudança automática irrestrita de estados críticos;
- integração direta com banco de CRM, Inventário ou outros produtos;
- marketplace de plugins.

## 12. Evolução futura

Depois da primeira release, poderão ser avaliados: subprocessos, paralelismo controlado, compensação, timers avançados, conectores externos via Framework de Conectores, compatibilidade/importação BPMN, simulação de processos e IA assistiva para criação de rascunhos — sempre como novos ciclos separados.
