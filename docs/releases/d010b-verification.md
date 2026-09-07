# D-010B — Verificação final Multi-Monitor

Data de verificação: 2026-09-06 (America/Sao_Paulo)

## Escopo validado

O D-010B evolui o Workspace D-010A para uma configuração com N superfícies lógicas. A superfície principal permanece no workspace corrente e as superfícies externas são abertas em janelas dedicadas do navegador, sempre por rota interna same-origin.

O domínio não estabelece um pequeno limite de monitores como regra de produto. O schema mantém somente limites defensivos de payload. O cenário de regressão validou 12 superfícies sintéticas sem abrir 12 janelas reais.

## Evidência técnica do candidato funcional

Candidato funcional verificado: `7dcbb8939d647a39ceb848493ef141c2480d3c44`.

No workflow Qualidade #693:

- security regression check: aprovado;
- TypeScript: aprovado;
- 181/181 arquivos de teste aprovados;
- 762/762 testes aprovados;
- build de produção: aprovado.

Regressões visuais no mesmo candidato:

- GIS visual homologation #680: aprovado;
- NEO external compatibility #617: aprovado;
- NEO workspace visual homologation #660: aprovado.

O ciclo TDD da integração/acessibilidade foi observado em RED antes do GREEN: o teste de teclado falhou porque `ArrowRight` não selecionava a próxima superfície; após a implementação de navegação acessível, a suíte completa passou.

## Contratos preservados

- compatibilidade determinística de WorkspaceLayout v1 para v2;
- exatamente uma superfície `primary` por layout válido;
- `screenId` é somente seletor de uma superfície já autorizada;
- `tenantId` e `userId` não são aceitos como autoridade pela URL externa;
- rota externa fixa: `/workspace/external`;
- catálogo fechado de widgets; nenhum componente, script ou URL arbitrária é carregado pelo layout;
- backend/tRPC permanece autoridade para leitura e persistência;
- BroadcastChannel é apenas coordenação entre janelas e não concede autorização;
- falha, bloqueio ou fechamento de janela externa não derruba a superfície principal;
- criação, renomeação, reordenação, troca da principal, movimentação de widgets e remoção/realocação trabalham em rascunho até `Salvar`;
- `Cancelar` restaura o layout carregado do backend.

## Acessibilidade

As tabs de superfícies usam foco roving e suportam:

- ArrowRight / ArrowDown: próxima superfície, com retorno ao início;
- ArrowLeft / ArrowUp: superfície anterior, com retorno ao fim;
- Home: primeira superfície;
- End: última superfície;
- clique continua suportado.

A abertura coordenada de operação mantém feedback explícito de janelas abertas, focadas e bloqueadas pelo navegador.

## Limitações e comportamento do navegador

A abertura de múltiplas janelas depende da política de pop-ups do navegador. O sistema não tenta contornar o bloqueador: a abertura ocorre após gesto explícito do usuário e superfícies bloqueadas são reportadas para reabertura manual.

A Window Management API é tratada como melhoria progressiva. Quando indisponível, sem permissão ou quando o navegador não fornece posicionamento confiável, as janelas continuam abrindo pelo fluxo normal. Identificadores físicos de display não são tratados como identidade permanente.

Quando BroadcastChannel não estiver disponível, a aplicação usa fallback seguro sem transformar armazenamento local ou mensagens entre janelas em autoridade de segurança. Persistência e autorização continuam no backend.

## Revisão de segurança e release

A revisão do diff entre `main` e o candidato funcional confirmou:

- nenhuma aplicação de migration em produção;
- nenhum grant produtivo;
- nenhum deploy produtivo;
- nenhuma autorização de merge em `main`;
- nenhuma URL/componente/script arbitrário introduzido pelo mecanismo multi-monitor.

A migration `drizzle/0007_d010a_workspace_layouts.sql` está versionada no repositório como parte da fundação D-010A, porém este fechamento não a aplica em banco produtivo.

## Gates finais

Após este documento e a atualização do changelog, o SHA documental final deve novamente passar por Qualidade, build e pelas três regressões visuais antes da criação do checkpoint `checkpoint/d010b-multimonitor-green-20260906`.

O checkpoint não autoriza merge, deploy, grants ou aplicação de migration em produção.
