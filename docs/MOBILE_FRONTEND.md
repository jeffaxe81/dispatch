# AXE Despacho — frontend adaptativo Android / iOS / tablet / desktop

## Decisão arquitetural

O frontend existente continua único, com os mesmos contratos de API tRPC, autenticação, controle de permissões, escopo organizacional e backend MySQL. **Nenhum cliente mobile conecta diretamente ao banco**. Por enquanto, não introduzir um segundo backend ou sincronização automática de escritas offline.

A entrega inicial adapta a interface responsiva. O empacotamento nativo, notificações push, rastreamento em segundo plano e instalação nas lojas exigem etapas e homologação posteriores. O manifesto permite preparar a experiência de instalação web, mas não equivale a um APK/IPA.

## Implementado neste ciclo (primeira base responsiva)

- Barra inferior de navegação em telas abaixo de 768px, composta somente de rotas autorizadas pelo menu já existente, com acesso ao menu completo.
- Menu lateral recolhido após navegação em telas pequenas, preservando o desktop.
- Áreas de toque maiores, padding de safe area (iOS), viewport sem bloqueio de zoom.
- Ocorrências em cartões mobile, mantendo tabela desktop e seus filtros/paginação.
- Kanban com rolagem horizontal por colunas e snap em telas pequenas.
- Ajuste de cabeçalho em cartões de equipes e CSS global para campos, diálogos, mapas e tabelas.
- Logs operacionais e pendências de jornada em cartões mobile; tabelas complexas de usuários com rolagem explícita acessível.
- Campos duplos do editor de workflows adaptados para uma coluna em telas estreitas.
- Manifesto web separado e ícone próprio do Despacho.
- Carregamento sob demanda de módulos React por rota (`lazy`/`Suspense`), reduzindo o JavaScript inicial em smartphones.
- Testes unitários para filtragem e seleção das rotas do menu mobile.

## Comunicação e segurança

As consultas e mutações continuam **assíncronas via HTTPS e tRPC**. A API acessa o MySQL com políticas de autorização centralizadas. O painel de campo já tem bloqueios contra escrita offline, expiração de consulta temporária e revalidação de atribuições; preservar esses controles. Não guardar senhas, detalhes sigilosos de ocorrências, endereços e posições em cache persistente. Uma próxima etapa poderá otimizar consultas incrementais por cursor/versionamento e eventos SSE *após* contratos e autorização serem aprovados.

## Homologação ainda pendente

- Testar visualmente e funcionalmente **todas** as rotas em larguras 320/360/390/430/768/1024px, portrait/landscape.
- Formulários complexos, detalhes, relatórios, GIS, telas administrativas, workspace multi-monitor, integrações e anexos precisam de auditoria visual e eventuais ajustes próprios.
- Testar Chrome/Android e Safari/iOS: teclado, permissões de GPS, zoom, acessibilidade, safe area, rolagem, autenticação e sessão.
- Validar rede intermitente, conflitos de revisão, uso em diferentes escopos e sem permissões de módulo.
- Executar CI: pnpm check, pnpm test, pnpm build e testes de navegador/e2e.
- Não considerar a adaptação homologada ou liberada para produção sem as verificações acima.

## Futuro Git separado

Os componentes de navegação e utilitários móveis foram isolados para permitir extração futura. Ao migrar para um repositório próprio, preservar a API versionada e os testes de contrato antes de separar o frontend.
