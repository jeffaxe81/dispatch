# D-010B — Multi-Monitor N Telas

**Data:** 2026-09-06  
**Repositório:** `jeffaxe81/dispatch`  
**Dependência:** D-010A — Workspace e Layout Engine  
**Status:** desenho aprovado para formalização

## 1. Objetivo

Estender o workspace operacional do AXE Dispatch para suportar múltiplas superfícies de exibição simultâneas, sem limite lógico fixo de quantidade de monitores. Cada superfície representa uma projeção do mesmo workspace persistido, podendo conter widgets distintos e independentes, sempre resolvidos pelo catálogo seguro já definido no D-010A.

O limite prático de telas abertas será determinado pelo navegador, sistema operacional, política de pop-ups, capacidade gráfica e recursos da estação, e não por um limite arbitrário do modelo de domínio.

## 2. Princípios

1. Reutilizar integralmente o modelo de workspace, catálogo seguro de widgets, RBAC e persistência server-side do D-010A.
2. Não criar um segundo mecanismo paralelo de layout para multi-monitor.
3. Uma configuração pode conter N superfícies (`screens`) ordenadas e nomeadas.
4. Cada superfície possui `screenId` estável e coleção própria de widgets.
5. O backend permanece a fonte autoritativa da configuração persistida.
6. Janelas externas não armazenam estado permanente independente.
7. Nenhuma URL, script ou componente arbitrário pode ser informado pelo layout.
8. A falha ou fechamento de uma janela secundária nunca deve derrubar a tela principal.
9. D-010B não altera regras de negócio de despacho, GIS, jornada, telecom, ocorrências ou equipes.

## 3. Modelo de domínio

O `WorkspaceLayout` evolui de um layout plano para uma estrutura versionada com superfícies:

```ts
WorkspaceLayout {
  id: string
  name: string
  version: 2
  screens: WorkspaceScreen[]
}

WorkspaceScreen {
  screenId: string
  name: string
  order: number
  mode: "primary" | "external"
  preferredDisplay?: PreferredDisplayHint
  widgets: WorkspaceWidgetInstance[]
}

PreferredDisplayHint {
  label?: string
  ordinal?: number
}
```

`preferredDisplay` é somente uma preferência de posicionamento/abertura. Ele nunca deve ser tratado como identificador confiável ou permanente de hardware.

### 3.1 Migração de versão

Layouts D-010A `version: 1` devem continuar válidos por migrador determinístico para `version: 2`, criando uma única superfície primária com os widgets existentes.

```ts
migrateWorkspaceV1ToV2(v1) => {
  ...,
  version: 2,
  screens: [{
    screenId: "primary",
    name: "Principal",
    order: 0,
    mode: "primary",
    widgets: v1.widgets,
  }],
}
```

Nenhum layout v1 deve ser perdido ou exigir intervenção manual para abrir.

## 4. Superfícies e janelas

A tela principal permanece dentro do shell normal do AXE Dispatch. Superfícies com `mode: "external"` podem ser abertas em janelas dedicadas do navegador.

Cada janela externa recebe somente identificadores não sensíveis na URL, por exemplo:

```text
/workspace/external?workspace=default&screen=<screenId>
```

A identidade do usuário, tenant e permissões continuam sendo resolvidas pela sessão autenticada no servidor.

A janela externa busca o layout atual via tRPC e renderiza apenas a superfície autorizada correspondente ao `screenId` solicitado.

## 5. Sincronização entre janelas

A sincronização de eventos de interface usará `BroadcastChannel` como mecanismo local primário entre janelas do mesmo navegador e mesma origem.

Eventos mínimos:

- `workspace-screen-opened`
- `workspace-screen-closed`
- `workspace-layout-updated`
- `workspace-refresh-requested`
- `workspace-focus-screen`

O backend continua sendo a autoridade para layout persistido. `BroadcastChannel` coordena experiência local, não substitui tRPC nem banco.

Se `BroadcastChannel` não estiver disponível, o sistema continua funcional sem sincronização instantânea e recarrega a configuração pelo backend.

## 6. Orquestrador de monitores

Criar um `MultiMonitorManager` responsável por:

- listar superfícies configuradas;
- abrir uma ou várias superfícies externas;
- manter mapa local de `screenId -> Window`;
- detectar janelas fechadas;
- evitar duplicação acidental da mesma superfície;
- focar uma janela já aberta quando solicitado;
- reabrir superfícies fechadas;
- disparar abertura coordenada do perfil salvo.

O manager nunca mantém dados de negócio; ele somente coordena superfícies visuais.

## 7. Abertura coordenada

A interface terá uma ação **Abrir configuração de operação**.

Ao acioná-la:

1. a tela principal identifica todas as superfícies `external` configuradas;
2. tenta abrir uma janela por superfície em resposta direta à ação do usuário;
3. registra quais janelas foram abertas com sucesso;
4. informa bloqueios de pop-up ou limitações do navegador sem quebrar a operação;
5. janelas já abertas são focadas, não duplicadas.

A aplicação não promete posicionamento perfeito em monitores físicos porque navegadores e sistemas operacionais podem restringir coordenadas e seleção de display.

Quando APIs de posicionamento de janelas estiverem disponíveis e autorizadas, `preferredDisplay` poderá ser usado como hint, com fallback seguro caso seja ignorado.

## 8. Templates e quantidade de monitores

O modelo não terá limite lógico fixo de superfícies.

Exemplos válidos:

- operador com 2 telas;
- despachador com 3 telas;
- supervisor com 4 telas;
- sala de crise com 8 telas;
- videowall/CCO com 10 ou mais superfícies.

Cada configuração é simplesmente uma coleção de `WorkspaceScreen`.

Nesta fase, templates administrativos globais continuam fora do escopo; D-010B trabalha sobre a configuração individual já suportada pelo D-010A.

## 9. Experiência de personalização

No modo **Personalizar workspace**, o usuário poderá:

- criar nova superfície;
- renomear superfície;
- alterar ordem;
- mover widget entre superfícies;
- adicionar/remover widget dentro de uma superfície;
- escolher qual superfície é primária;
- marcar superfície como externa;
- salvar;
- cancelar;
- restaurar configuração padrão.

Deve existir exatamente uma superfície `primary` por layout válido.

Remover uma superfície com widgets exige realocação explícita ou confirmação de remoção desses widgets no rascunho antes de salvar.

## 10. Segurança

- `tenantId` e `userId` continuam exclusivamente server-side;
- `screenId` é validado como identificador do layout autorizado atual;
- nenhuma URL arbitrária é persistida por superfície;
- nenhuma superfície pode carregar componente fora do `workspaceWidgetRegistry`;
- widgets continuam filtrados por RBAC/capabilities;
- iframes futuros continuam sujeitos a CSP/origin e catálogo explícito;
- nenhum token, segredo ou credencial pode estar em `screens`, `widgets` ou `settings`;
- uma janela externa sem sessão válida é redirecionada para autenticação/estado seguro;
- uma superfície inexistente ou removida retorna fallback seguro, nunca execução arbitrária.

## 11. Resiliência

- janela secundária fechada: principal continua operando;
- principal fechada: janelas externas continuam apenas enquanto a sessão e rota forem válidas, mas não assumem autoridade de persistência;
- layout atualizado em outra janela: sinal local + refetch do backend;
- layout corrompido: migrador/fallback para configuração segura;
- `screenId` desconhecido: mensagem de superfície indisponível + retorno à principal;
- pop-up bloqueado: informar quais superfícies não abriram e permitir tentativa manual;
- falha de `BroadcastChannel`: operação degradada usando refetch periódico/manual.

## 12. Rotas e componentes

Componentes previstos:

- `MultiMonitorManager`
- `WorkspaceScreenCanvas`
- `WorkspaceExternalScreenPage`
- `WorkspaceScreensEditor`
- `WorkspaceScreenTabs`
- `workspaceChannel`

Rota prevista:

```text
/workspace/external
```

A rota recebe `workspace` e `screen` apenas como seletores; autorização real permanece no servidor.

## 13. Persistência

A D-010B prefere evoluir o JSON existente de `workspace_layouts` para `version: 2`, evitando nova tabela específica de monitores.

A migration de banco só será necessária se o schema físico do D-010A exigir mudança incompatível. Se `layout_json` já for genérico, a evolução deve ocorrer por versionamento do payload e migrador de domínio.

Nenhuma migration é aplicada automaticamente em banco real.

## 14. Testes obrigatórios

### Domínio
- v1 migra para v2 sem perda;
- exatamente uma superfície primária;
- `screenId` duplicado rejeitado;
- ordem e nomes válidos;
- quantidade arbitrária de superfícies aceita dentro dos limites de payload defensivos;
- widgets continuam limitados ao catálogo seguro.

### Manager
- abre todas as superfícies externas configuradas;
- não duplica janela existente;
- foca janela já aberta;
- detecta fechamento;
- reabre superfície fechada;
- tolera pop-up bloqueado;
- não abre superfície inexistente.

### BroadcastChannel
- atualização gera refetch nas demais janelas;
- fechamento/abertura atualiza estado local;
- ausência da API não derruba a aplicação.

### UI
- criar/renomear/reordenar superfície;
- mover widget entre superfícies;
- definir primária;
- salvar/cancelar/resetar;
- rota externa renderiza somente a superfície solicitada;
- superfície inválida apresenta fallback seguro.

### Segurança
- URL não consegue trocar tenant/user;
- `screenId` arbitrário não permite acesso fora do layout;
- componente/URL remota em layout é rejeitado;
- capability removida retira widget também em janela externa.

### Regressão
- D-010A single-screen continua funcionando;
- Home padrão permanece funcional;
- GIS, NEO, Jornada e Ocorrências sem alteração de regra de negócio;
- `pnpm security:check`, `pnpm check`, suíte completa e build GREEN no gate final.

## 15. Escopo fora da D-010B

- administração centralizada de templates por tenant/perfil — D-010D;
- videowall especializado com controle de hardware;
- execução de apps arbitrários dentro das superfícies;
- streaming de desktop remoto;
- dependência obrigatória de APIs experimentais de multi-screen positioning;
- sincronização cross-device em tempo real além do backend normal;
- deploy produtivo, grants ou migration real.

## 16. Critérios de aceite

D-010B estará funcionalmente pronto quando:

1. um layout v1 abrir como layout v2 automaticamente;
2. o usuário puder configurar N superfícies;
3. superfícies externas puderem ser abertas por ação explícita;
4. janelas duplicadas forem evitadas;
5. alteração persistida puder ser refletida nas janelas abertas;
6. falha/fechamento de uma janela não afetar as demais;
7. segurança de tenant/RBAC/catalog permanecer fail-closed;
8. single-screen D-010A permanecer compatível;
9. gates finais estiverem GREEN no mesmo SHA candidato.

## 17. Relação com próximas fases

- **D-010A:** base obrigatória — layout, catálogo, persistência e personalização.
- **D-010B:** N monitores, superfícies externas e sincronização local.
- **D-010C:** expansão incremental do catálogo de widgets.
- **D-010D:** templates por perfil/tenant e administração central.
- **D-010E:** recursos avançados de sala de crise/videowall, se priorizados.
