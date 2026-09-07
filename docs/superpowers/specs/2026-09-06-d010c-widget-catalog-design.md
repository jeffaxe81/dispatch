# D-010C — Catálogo Ampliado de Widgets Operacionais

## 1. Objetivo

Evoluir o Workspace Operacional do D-010A/D-010B de um catálogo inicial de seis widgets para um catálogo operacional ampliado, reutilizável em uma ou N superfícies, mantendo autorização, isolamento por tenant, persistência do layout e compatibilidade com multi-monitor.

O D-010C não cria páginas paralelas completas dentro do Workspace. Ele cria widgets focados, com contratos pequenos e reutilizáveis, capazes de compor diferentes postos operacionais.

## 2. Estado atual

O contrato compartilhado reconhece atualmente estes tipos: `operational-map`, `metrics`, `priority-queue`, `incidents`, `teams` e `work-shift`.

O `WorkspaceScreenCanvas` já resolve widgets por `widgetRegistry` e renderiza cada instância na grade de 12 colunas. O registro atual concentra título, permissões exigidas, tamanho padrão, tamanho mínimo e configurações padrão.

## 3. Escopo aprovado do D-010C.1

Adicionar ao catálogo os seguintes tipos operacionais:

1. `kanban` — Kanban operacional de ocorrências por estado/prioridade.
2. `incident-detail` — detalhe da ocorrência selecionada no contexto da superfície.
3. `resources` — recursos operacionais, equipes e viaturas disponíveis/ocupadas.
4. `sla-alerts` — alertas, violações, risco de SLA e escalonamentos.
5. `neo-communication` — ponto de integração da comunicação NEO já homologada, sem duplicar autenticação nem contornar políticas de iframe.
6. `operational-timeline` — histórico/timeline de eventos e decisões operacionais.
7. `dynamic-form` — formulário dinâmico/no-code do D-008 em contexto operacional autorizado.
8. `configurable-dashboard` — composição de indicadores/dados aprovados para o perfil.
9. `authorized-iframe` — aplicação incorporada somente por destino previamente autorizado e política de integração existente.

## 4. Princípios arquiteturais

### 4.1 Catálogo fechado

O cliente e o servidor continuam aceitando apenas tipos declarados em `workspaceWidgetTypes`. Não haverá tipo arbitrário vindo do banco, URL ou configuração do usuário.

### 4.2 Registro como fonte de metadados de apresentação

`widgetRegistry` continuará sendo a fonte de metadados de UI: título, permissões, tamanhos e configuração padrão. A renderização funcional será separada do metadado, evitando transformar o registry em um arquivo monolítico.

### 4.3 Renderers isolados

Cada novo widget terá um renderer/componente próprio com interface explícita. O `WorkspaceScreenCanvas` apenas resolve e monta o componente correspondente; regras de negócio não serão incorporadas ao canvas.

### 4.4 Contexto operacional explícito

Widgets que dependem de uma ocorrência selecionada ou outro contexto compartilhado usarão um contrato de contexto do Workspace, sem inferir `tenantId` ou `userId` de parâmetros de URL. A autoridade continuará no backend/sessão.

### 4.5 Multi-monitor por construção

Todos os widgets deverão funcionar tanto na superfície primária quanto em superfícies externas do D-010B. Nenhum widget poderá depender exclusivamente do ciclo de vida da página principal.

## 5. Autorização e tenant

A visibilidade no catálogo continuará condicionada às permissões necessárias. Além da filtragem de UI, cada chamada de dados continuará usando procedures existentes ou novas procedures server-side que resolvam autorização, tenant e escopo operacional no servidor.

Permissões previstas, preferencialmente reutilizando as já existentes:

- Kanban/ocorrência/detalhe/SLA/timeline: `occurrences.view` e permissões adicionais somente quando houver ação mutável;
- recursos: `teams.view` e permissões de recursos/viaturas existentes quando aplicável;
- NEO e iframe autorizado: `integrations.view`;
- formulários: permissões `forms.*` já definidas no D-008;
- jornada permanece sob `work_shifts.view`;
- dashboards reutilizam as permissões das fontes de dados exibidas.

Nenhuma permissão produtiva será concedida automaticamente pelo D-010C.

## 6. Modelo de renderização

Introduzir uma camada de resolução funcional, conceitualmente:

- `widgetRegistry`: metadados e política de catálogo;
- `widgetRendererRegistry`: tipo → componente funcional;
- `WorkspaceWidgetFrame`: moldura comum, estado de carregamento, erro seguro e título;
- renderers especializados por widget.

O `WorkspaceScreenCanvas` permanecerá responsável somente por layout, posicionamento e montagem segura.

## 7. Contexto entre widgets

O D-010C deverá suportar um contexto efêmero por superfície para interações como:

- selecionar uma ocorrência no Kanban e exibi-la no `incident-detail`;
- selecionar uma ocorrência/mapa e refletir a seleção na timeline;
- abrir formulário dinâmico vinculado à ocorrência atual;
- usar a mesma seleção em uma superfície externa, quando explicitamente sincronizada.

Esse contexto não substitui o backend e não será fonte de autorização. Dados persistentes continuam vindo de APIs autorizadas.

## 8. Configurações por widget

Cada widget poderá usar `settings`, mas com schema específico e validação por tipo. Configurações desconhecidas deverão ser rejeitadas ou normalizadas para defaults seguros.

Exemplos previstos:

- filtros de status/prioridade no Kanban;
- modo resumido/completo na timeline;
- conjunto de métricas no dashboard;
- identificador de formulário publicado no `dynamic-form`;
- identificador de destino previamente autorizado no `authorized-iframe`.

Nenhuma URL arbitrária poderá ser armazenada como destino de iframe.

## 9. Tratamento de erro

Cada renderer deve falhar de forma local, sem derrubar a superfície inteira.

Estados mínimos:

- carregando;
- vazio;
- indisponível;
- sem autorização;
- erro sanitizado.

Erros não devem expor stack trace, dados de outro tenant ou detalhes internos de integração.

## 10. Compatibilidade

Layouts v2 existentes do D-010B devem continuar válidos sem migração obrigatória. A ampliação do enum de widgets é retrocompatível com layouts já persistidos.

Não haverá nova migration de banco apenas para adicionar os novos tipos, salvo se a implementação identificar necessidade real de persistência adicional; qualquer migration descoberta será tratada como gate separado.

## 11. Estratégia de testes

O desenvolvimento seguirá TDD RED → GREEN.

Cobertura mínima:

1. contrato compartilhado aceita somente os novos tipos declarados;
2. normalização remove tipos não autorizados/desconhecidos;
3. registry aplica permissões corretamente;
4. renderer resolve cada tipo conhecido e rejeita desconhecidos;
5. erro de um widget não interrompe os demais;
6. configurações específicas são validadas;
7. `incident-detail`, timeline e formulário não aceitam tenant/user como autoridade externa;
8. iframe/NEO preservam allowlist e políticas existentes;
9. regressão do D-010B: widgets funcionam em superfície primária e externa;
10. regressão integral dos gates de Qualidade, GIS, NEO external e NEO workspace.

## 12. Fora de escopo desta parte

- editor visual avançado de dashboards;
- marketplace/plugins arbitrários de widgets;
- execução de scripts fornecidos pelo usuário;
- URLs livres para iframe;
- nova autenticação/SSO para NEO;
- deploy produtivo;
- aplicação automática de migrations;
- grants automáticos;
- alteração do modelo multi-tenant planejado para futura evolução.

## 13. Sequência de implementação proposta

1. contrato e schemas dos novos tipos/configurações;
2. registry de metadados e renderer registry;
3. moldura comum e isolamento de falhas;
4. widgets de leitura operacional: Kanban, detalhe, recursos, SLA e timeline;
5. integração controlada NEO/iframe;
6. formulário dinâmico e dashboard configurável;
7. contexto compartilhado entre widgets;
8. regressão multi-monitor e segurança;
9. documentação, checkpoint, PR e gates finais.

## 14. Critérios de aceite

O D-010C.1 será considerado implementado quando:

- os nove novos tipos estiverem disponíveis somente para perfis autorizados;
- cada tipo possuir renderer funcional isolado;
- widgets puderem ser distribuídos entre N superfícies;
- seleção/contexto operacional funcionar sem transformar o cliente em autoridade de tenant;
- iframe/NEO permanecerem restritos a destinos homologados;
- layouts D-010B existentes permanecerem válidos;
- suíte TDD e todos os gates finais estiverem GREEN;
- documentação de verificação e checkpoint estiverem registrados;
- nenhum deploy, migration real ou grant tiver sido executado automaticamente.
