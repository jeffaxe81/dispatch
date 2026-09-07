# D-010B — Contrato de Segurança do Multi-Monitor

## Princípios

O multi-monitor é uma projeção de um único workspace autorizado. Ele não cria workspaces independentes, não aceita URLs arbitrárias e não transfere autoridade de tenant ou usuário para a URL, para o `BroadcastChannel` ou para o navegador.

## Rota externa

A única rota externa suportada é `/workspace/external?workspace=<name>&screen=<screenId>`.

Somente as chaves `workspace` e `screen` são aceitas. Qualquer chave adicional torna a solicitação inválida. `tenantId`, `userId`, tokens, URLs externas, nomes de componentes e scripts não são aceitos na rota.

A página externa consulta exclusivamente `workspace.getOwnScreen`. O backend resolve tenant e usuário a partir da sessão autenticada e usa `screenId` apenas como seletor dentro do layout já autorizado. Tela inexistente retorna `NOT_FOUND`; ausência de sessão retorna `UNAUTHORIZED`.

## Catálogo fechado de widgets

Superfícies renderizam apenas tipos existentes em `workspaceWidgetRegistry`. Não há carregamento de componente por string arbitrária, `eval`, `new Function`, URL remota ou script injetado pelo layout.

## Comunicação entre janelas

`BroadcastChannel` é somente coordenação de UX e nunca autoridade de segurança. Os eventos permitidos são:

- `workspace-screen-opened`
- `workspace-screen-closed`
- `workspace-layout-updated`
- `workspace-refresh-requested`
- `workspace-focus-screen`

Eventos fora da allowlist são descartados ou rejeitados. Mensagens como `execute-script` não são aceitas.

## Posicionamento de displays

`getScreenDetails()` é melhoria progressiva. O launcher reduz os dados de cada display a `label`, `left`, `top`, `width` e `height`. Identificadores físicos/internos não são persistidos nem propagados para o layout.

Falha da API, ausência de suporte ou negação de permissão nunca impede a abertura da superfície externa.

## Evidências automatizadas

- `server/routers/workspace.test.ts`
- `client/src/pages/WorkspaceExternalScreenPage.test.tsx`
- `client/src/workspace/multimonitor/MultiMonitorManager.test.ts`
- `client/src/workspace/multimonitor/workspaceChannel.test.ts`
- `client/src/workspace/multimonitor/multimonitorSecurity.test.ts`
- `scripts/security-regression-check.mjs`

## Contratos tRPC relacionados

- `workspace.getOwn`
- `workspace.getOwnScreen`
- `workspace.saveOwn`
- `workspace.resetOwn`

Todos permanecem server-authoritative para tenant/usuário; nenhum contrato D-010B aceita `tenantId` ou `userId` fornecido pelo cliente.
