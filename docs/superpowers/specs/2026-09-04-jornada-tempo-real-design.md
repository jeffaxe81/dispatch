# Jornada em Tempo Real — Design

## Contexto

O backend da Fase 1 do ÉPICO #7 já possui domínio de jornada, persistência transacional, auditoria, API autenticada e migração Drizzle homologada em CI. Falta o fluxo visual para o próprio usuário operar sua jornada antes da integração com o motor de despacho.

## Objetivo

Criar uma tela responsiva `/jornada` para o usuário autenticado consultar e alterar exclusivamente a própria jornada, sem aceitar `userId` do cliente e sem mover a responsabilidade de horário para o navegador.

## Abordagem escolhida

Página própria integrada ao `DashboardLayout` e ao menu lateral. A página consome `workShift.current` e as mutações `workShift.start`, `workShift.break`, `workShift.resume` e `workShift.end` já existentes.

Esta abordagem foi escolhida no lugar de colocar Jornada apenas no Aplicativo Agente ou em um widget global porque atende agentes, despachantes, supervisores e demais usuários operacionais e deixa espaço para evolução futura de escalas, histórico e relatórios.

## Comportamento visual

A página exibirá:

- título `Jornada em Tempo Real`;
- estado atual com rótulo legível;
- início da jornada quando existir;
- início do intervalo quando existir;
- término quando existir;
- ação disponível conforme o estado;
- feedback de carregamento e erro;
- mensagens de sucesso após transições.

### Ações por estado

- `fora_jornada`: botão `Iniciar jornada`;
- `em_jornada`: botões `Iniciar intervalo` e `Encerrar jornada`;
- `em_intervalo`: botão `Retomar jornada`;
- `encerrada`: botão `Iniciar nova jornada`.

Enquanto uma mutação estiver pendente, os botões de alteração ficam desabilitados.

## Fluxo de dados

1. a página chama `workShift.current`;
2. o servidor resolve o usuário pela sessão autenticada;
3. a interface deriva estado, rótulos e ações do retorno;
4. uma ação chama somente a mutação correspondente, sem payload de usuário ou timestamp;
5. ao concluir, a página invalida `workShift.current`;
6. o servidor permanece responsável por data/hora e auditoria.

## Navegação

- rota nova: `/jornada`;
- item `Jornada` no `DashboardLayout`;
- disponível para usuário autenticado e ativo;
- não depende de permissão administrativa;
- mantém o comportamento atual das demais rotas.

## Responsividade

- largura máxima de conteúdo centralizada em desktop;
- cards empilhados em mobile;
- ações com quebra segura para telas estreitas;
- sem dependência de viewport fixa;
- mesma linguagem visual azul/cinza já usada no AXE Dispatch.

## Acessibilidade

- estado atual exposto como texto, não apenas por cor;
- erros em região `role="alert"`;
- botões com rótulos explícitos;
- estados pendentes comunicados pelo texto do botão e por `disabled`.

## Testes

### Componente

Cobrir:

- `fora_jornada` mostra `Iniciar jornada`;
- `em_jornada` mostra `Iniciar intervalo` e `Encerrar jornada`;
- `em_intervalo` mostra `Retomar jornada`;
- clique chama a mutação correta;
- sucesso invalida `workShift.current`;
- erro retornado pelo servidor aparece na tela;
- botões ficam indisponíveis durante mutação.

### Integração visual

O CI deve rodar os testes da página e `pnpm check`. A homologação visual desktop/mobile será adicionada em etapa própria antes de integrar Jornada ao motor de despacho.

## Fora do escopo desta etapa

- painel de supervisão com múltiplos usuários;
- escala 12x36;
- banco de horas;
- ajustes administrativos;
- relatórios;
- geolocalização de eventos de jornada;
- filtro no motor de despacho.

Esses itens permanecem nas fases seguintes do ÉPICO #7.
