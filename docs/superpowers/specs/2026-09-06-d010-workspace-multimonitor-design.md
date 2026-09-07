# D-010 — Workspace Operacional Customizável e Multi-Monitor

**Data:** 2026-09-06  
**Repositório:** `jeffaxe81/dispatch`  
**Escopo inicial:** D-010A — Workspace e Layout Engine  
**Status:** desenho aprovado para formalização

## 1. Objetivo

Evoluir a interface operacional do AXE Dispatch para um workspace configurável por usuário/perfil, preservando o shell atual e os fluxos existentes. O operador poderá compor a tela com widgets aprovados, redimensionar e reposicionar blocos, salvar a configuração no backend e restaurar um layout seguro quando necessário.

A arquitetura deve preparar suporte real a dois ou mais monitores sem criar uma segunda solução paralela. O multi-monitor será uma projeção do mesmo modelo de layout e catálogo de widgets.

## 2. Princípios

1. Preservar `DashboardLayout`, navegação Wouter, RBAC e contratos tRPC existentes.
2. Não permitir componente arbitrário informado pelo banco: widgets são resolvidos por catálogo estático/registrado no cliente e validados no servidor.
3. Persistir preferências no backend; `localStorage` pode ser usado apenas como cache efêmero, nunca como fonte autoritativa.
4. O layout deve ser versionado para suportar migrações futuras.
5. Falhas de layout não podem impedir a operação: fallback parcial ou total para template seguro.
6. O workspace respeita tenant, identidade autenticada e capabilities/RBAC do usuário.
7. D-010A não cria regras novas de negócio de ocorrência, GIS, jornada ou telecom; apenas organiza visualização e interação com capacidades já existentes.

## 3. Arquitetura recomendada

### 3.1 Modelo central

Criar o conceito `WorkspaceLayout`, associado a:

- `tenantId` obtido do contexto autenticado;
- `userId` obtido do contexto autenticado;
- `profile/operationalRole` apenas como referência para fallback/template;
- `version` do formato do layout;
- coleção ordenada de instâncias de widgets;
- metadados mínimos de atualização.

Exemplo lógico:

```ts
WorkspaceLayout {
  id
  tenantId
  userId
  name
  version
  widgets: WorkspaceWidgetInstance[]
  createdAt
  updatedAt
}

WorkspaceWidgetInstance {
  instanceId
  type
  x
  y
  w
  h
  settings
}
```

`tenantId` e `userId` nunca são aceitos como autoridade a partir do body do cliente; são definidos no servidor.

### 3.2 Catálogo de widgets

Criar um registro explícito de widgets permitidos, com metadados:

- `type` estável;
- título;
- componente React associado;
- dimensões mínimas/máximas;
- permissões/capabilities exigidas;
- schema de `settings`;
- indicação se pode aparecer em janela externa/multi-monitor no futuro.

Widgets iniciais D-010A:

1. `operational-map` — mapa operacional existente;
2. `metrics` — indicadores resumidos da operação;
3. `priority-queue` — fila prioritária;
4. `incidents` — visão resumida/listagem de ocorrências;
5. `teams` — equipes e disponibilidade;
6. `work-shift` — situação operacional/jornada.

Widgets como telecom/iframe, dashboards completos, Kanban e alertas entram depois por registro incremental no mesmo catálogo.

### 3.3 Engine de layout

A D-010A utilizará uma grade responsiva com drag/resize. Como o projeto já usa `react-resizable-panels`, o componente pode ser reaproveitado onde fizer sentido, mas o workspace exige posicionamento bidimensional. A implementação deverá escolher uma biblioteca de grid compatível com React 19 ou uma camada própria pequena; a decisão final será feita no plano de implementação após verificação de compatibilidade/licença.

O modo padrão é somente leitura. Alterações só ocorrem quando o usuário ativa explicitamente **Personalizar workspace**.

Ações mínimas:

- mover widget;
- redimensionar;
- adicionar widget permitido;
- remover widget removível;
- salvar;
- cancelar alterações locais;
- restaurar layout padrão.

## 4. Persistência e precedência

Precedência de resolução:

1. layout individual válido do usuário;
2. template de perfil/role quando existir;
3. template padrão do sistema.

Na D-010A, somente o layout individual e o template padrão do sistema são obrigatórios. Templates administrativos por perfil/tenant ficam para D-010D.

Persistência sugerida em tabela própria, por exemplo `workspace_layouts`, com `layout_json` validado por schema e unicidade por `(tenant_id, user_id, name)`.

Nenhuma migration deve ser aplicada automaticamente em banco real; segue o gate padrão do Prompt Master.

## 5. Segurança e RBAC

- leitura e gravação sempre no tenant autenticado;
- usuário só altera o próprio layout na D-010A;
- o servidor revalida todos os `widget.type` enviados;
- widgets sem capability são removidos/rejeitados no carregamento e no save;
- `settings` de cada widget passam por schema específico;
- nenhuma URL/component name arbitrária pode ser salva e renderizada;
- iframe/telecom continua sujeito aos controles CSP/origin já existentes;
- não armazenar tokens, credenciais ou dados sensíveis em `layout_json`;
- operação de reset/salvamento deve ser auditável pelo padrão existente quando aplicável.

Permissões novas só serão criadas se a revisão do RBAC atual mostrar necessidade. Preferência inicial: reutilizar permissões de leitura dos domínios e criar apenas capability de personalização se realmente necessária.

## 6. Compatibilidade com a Home atual

A atual `Home.tsx` já contém:

- cabeçalho operacional;
- métricas;
- mapa;
- fila prioritária;
- refresh configurável.

A migração será incremental:

1. extrair mapa, métricas e fila prioritária em widgets sem alterar comportamento;
2. introduzir `WorkspacePage`/`WorkspaceCanvas` dentro do `DashboardLayout`;
3. usar um layout padrão equivalente à Home atual;
4. somente depois habilitar personalização.

Assim, o primeiro deploy funcional da D-010A deve manter experiência equivalente para quem nunca personalizou a tela.

## 7. Multi-monitor — preparação arquitetural

D-010A não precisa abrir múltiplas janelas ainda, mas o modelo deve evitar bloqueios para D-010B.

Cada widget terá `instanceId` estável e será independente do contêiner visual. Em D-010B, uma instância ou grupo de instâncias poderá ser projetado para uma janela externa usando `window.open`/BroadcastChannel ou mecanismo equivalente, sem duplicar regras de negócio.

O estado autoritativo continuará no backend e nas queries compartilhadas; a janela externa será apenas outra superfície visual autenticada.

## 8. Tratamento de erros e resiliência

Ao carregar layout:

- versão desconhecida → tentar migrador conhecido; se impossível, fallback seguro;
- widget desconhecido → ignorar somente o widget e registrar diagnóstico;
- widget sem permissão → omitir;
- settings inválidas → usar defaults do widget;
- layout vazio/corrompido → restaurar template padrão;
- falha temporária de persistência → manter operação visual atual e informar que alterações não foram salvas.

A tela operacional nunca deve ficar inutilizável por erro de personalização.

## 9. Testes obrigatórios

### Domínio/schema
- validação de layout e widget instance;
- rejeição de type desconhecido;
- versionamento e fallback;
- tenant/user server-side.

### API/tRPC
- get do próprio layout;
- save do próprio layout;
- reset;
- autorização/RBAC;
- body não consegue trocar tenant/user;
- settings inválidas rejeitadas/sanitizadas conforme contrato.

### UI
- render do layout padrão;
- modo editar ligado/desligado;
- adicionar/remover/mover/redimensionar;
- salvar/cancelar/reset;
- widget sem permissão não renderiza;
- layout inválido não derruba a Home.

### Regressão
- Home mantém comportamento funcional equivalente;
- GIS/OperationalMap permanece funcional;
- refresh existente permanece funcional;
- jornadas, ocorrências e equipes não mudam regras de negócio;
- security check, TypeScript, suíte completa e build permanecem GREEN.

## 10. Escopo fora da D-010A

- abrir widgets em múltiplos monitores/janelas — D-010B;
- administração de templates por tenant/perfil — D-010D;
- catálogo completo de todos os módulos — evolução D-010C;
- sincronização avançada entre janelas — D-010B;
- “desktop web” com processos arbitrários;
- plugins de terceiros executáveis;
- alterações nas regras de despacho/GIS/jornada;
- deploy, migration produtiva ou grants automáticos.

## 11. Fases do épico D-010

### D-010A — Workspace e Layout Engine
- modelo versionado;
- catálogo seguro;
- widgets iniciais;
- personalização e persistência individual;
- fallback seguro.

### D-010B — Multi-monitor
- janelas externas;
- projeção de widgets/grupos;
- sincronização e recuperação de janela fechada/desconectada.

### D-010C — Catálogo ampliado
- telecom/iframe;
- Kanban;
- dashboards;
- alertas;
- outros módulos operacionais.

### D-010D — Administração e RBAC
- templates por perfil/tenant;
- widgets obrigatórios/bloqueados;
- políticas administrativas de layout.

### D-010E — Resiliência operacional
- recuperação automática de layout;
- fallback de multi-monitor;
- diagnóstico de superfícies desconectadas;
- restauração segura após falhas.

## 12. Critérios de aceite D-010A

1. Usuário autorizado abre a central e recebe um layout padrão equivalente à Home atual quando não possui configuração.
2. Usuário entra em modo de personalização explicitamente.
3. Pode mover/redimensionar/adicionar/remover apenas widgets permitidos.
4. Pode salvar e recuperar o mesmo layout em outra sessão/dispositivo.
5. Não consegue salvar widget não registrado, trocar tenant ou alterar layout de outro usuário.
6. Perda/corrupção de layout nunca impede uso da central; template seguro é carregado.
7. Layout preserva funcionalidades atuais de mapa, métricas e fila prioritária.
8. Gates finais: security check, TypeScript, suíte completa e build GREEN.
9. Migration, se criada, permanece apenas versionada até autorização separada.
10. Nenhum deploy produtivo é parte da aprovação funcional.

## 13. Decisão arquitetural

Adotado o caminho **híbrido incremental**: preservar o shell atual e transformar gradualmente a Home em workspace baseado em catálogo seguro e layout persistente. O modelo é preparado desde o início para D-010B multi-monitor, evitando criar duas arquiteturas de interface.
