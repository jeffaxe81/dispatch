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
- Persistência **opt-in** do resumo mínimo de ocorrências no dispositivo (15 minutos, escopo isolado, exclusão explícita); rascunhos de notas continuam apenas na aba.
- Testes de persistência: reabertura simulada, expiração, isolamento e limpeza no logout.

## Comunicação e segurança

As consultas e mutações continuam **assíncronas via HTTPS e tRPC**. A API acessa o MySQL com políticas de autorização centralizadas. O painel de campo já tem bloqueios contra escrita offline, expiração de consulta temporária e revalidação de atribuições; preservar esses controles. Não guardar senhas, detalhes sigilosos de ocorrências, endereços e posições em cache persistente. Uma próxima etapa poderá otimizar consultas incrementais por cursor/versionamento e eventos SSE *após* contratos e autorização serem aprovados.

## Homologação ainda pendente

- Testar visualmente e funcionalmente **todas** as rotas em larguras 320/360/390/430/768/1024px, portrait/landscape.
- Formulários complexos, detalhes, relatórios, GIS, telas administrativas, workspace multi-monitor, integrações e anexos precisam de auditoria visual e eventuais ajustes próprios.
- Testar Chrome/Android e Safari/iOS: teclado, permissões de GPS, zoom, acessibilidade, safe area, rolagem, autenticação e sessão.
- Validar rede intermitente, conflitos de revisão, uso em diferentes escopos e sem permissões de módulo.
- Executar CI: pnpm check, pnpm test, pnpm build e testes de navegador/e2e.
- Não considerar a adaptação homologada ou liberada para produção sem as verificações acima.

## Android nativo para equipes em campo

**Opção recomendada:** Capacitor + React com um módulo de localização nativo Android (plugin auditado ou serviço Kotlin), sem reescrever todo o frontend. A PWA continua disponível para consultas com o app aberto. Android poderá receber um APK assinado para distribuição corporativa privada, respeitando o processo de verificação de desenvolvedor aplicável e as políticas de dispositivos administrados.

O plugin básico `@capacitor/geolocation` não fornece rastreamento de localização em segundo plano de forma direta. Para uma jornada iniciada pelo próprio agente, o app nativo deve configurar um **foreground service do tipo location** com notificação visível, permissões compatíveis com Android 14+ e comando de encerrar compartilhamento. A suspensão por economia de bateria, permissões revogadas e encerramento forçado devem indicar perda de rastreio à central, nunca simular posição atual.

Na fase nativa, a persistência mais completa poderá utilizar SQLite criptografado e Android Keystore, com expiração por política da operação, isolamento do usuário/organização, remoção no logout e sincronização via API HTTPS. O `WorkManager` ajuda a reenviar trabalhos de sincronização com rede disponível, mas não é substituto para um serviço de localização contínua e não garante tempo real. O backend deverá receber idempotency keys e rejeitar eventos fora de ordem antes de habilitarmos o armazenamento local de posições para replay.

O modo **PWA** não deve armazenar localização, endereços, dados pessoais, credenciais ou anexos sem aprovação da política de segurança. A funcionalidade atual de persistência local limita-se a um resumo redigido, que nunca autoriza aceitar ou mudar uma ocorrência offline. A sessão autenticada deve ser confirmada pelo servidor antes de qualquer operação.

**Pendências para gerar APK de homologação:** integração de API/autenticação na origem nativa, configuração Capacitor/Android, certificado de assinatura, permissão de GPS, serviço nativo, testes físicos de bateria/segundo plano e revisão LGPD/privacidade.

## Futuro Git separado

Os componentes de navegação e utilitários móveis foram isolados para permitir extração futura. Ao migrar para um repositório próprio, preservar a API versionada e os testes de contrato antes de separar o frontend.
