# Histórico de versões

Este arquivo registra mudanças funcionais relevantes do AXE Dispatch. As versões seguem **Versionamento Semântico** no formato `MAJOR.MINOR.PATCH`.

| Tipo de alteração | Incremento | Exemplo |
|---|---:|---|
| Mudança incompatível de contrato, dados ou segurança | MAJOR | `2.0.0` |
| Funcionalidade compatível adicionada | MINOR | `1.1.0` |
| Correção ou ajuste compatível | PATCH | `1.0.1` |

## [1.15.1] — 2026-08-29

### Corrigido — instalação reproduzível

A versão do pnpm passou a ter uma única fonte em `packageManager`. Foram removidos a dependência redundante do pnpm, o patch de `wouter@3.7.1` incompatível com o Wouter 3.10 atual e overrides que já não representavam a árvore registrada. O `esbuild` foi incluído como único pacote autorizado a executar script de instalação. Nenhuma biblioteca funcional foi atualizada; a instalação congelada passou de 711 para 710 pacotes apenas pela remoção do pnpm redundante.

Foi adicionado um teste de regressão para impedir nova divergência entre manifesto, workspace e lockfile. Validação: instalação limpa com `corepack pnpm install --frozen-lockfile`, segurança aprovada com 3 migrações e 11 correções preservadas, TypeScript aprovado, **193 testes aprovados em 54 arquivos** sem dependências externas e build de produção concluído. As duas suítes de integração que exigem banco e credenciais de bootstrap permanecem dependentes do ambiente e serão tratadas no D-002.

## [1.15.0] — 2026-08-23

### Segurança e confiabilidade

Esta versão corrige a auditoria independente do pacote 1.14.23. A cadeia de migrações foi restaurada, a duplicidade de coluna foi removida, segredos críticos passaram a ser validados antes da inicialização e o acesso a evidências/fotos agora exige sessão e autorização sobre o objeto. Relatórios e exportações respeitam o escopo dinâmico, exigindo equipe autorizada quando o papel não é global.

O fluxo OAuth passou a distinguir cookies seguros de produção e cookies locais `SameSite=Lax`; cabeçalhos de proxy só são considerados quando `TRUST_PROXY=true`. O receptor ALRT agora aplica o limite de 256 KiB no parser da própria rota e usa reservas de rate limit compartilhadas no MySQL, serializadas entre réplicas. Foram adicionados testes de regressão para configuração, cookies, armazenamento, escopo e corpo ALRT excedente.

## [1.14.23] — 2026-08-22

### Equipes — jornada operacional

A área **Equipes** passou a ter o ciclo completo da **jornada operacional da equipe**: iniciar, pausar, retomar e encerrar. O cartão apresenta situação da jornada, horário de início, tempo acumulado de pausas e tempo líquido. O agente vinculado à própria equipe pode operar o ciclo dentro do escopo autorizado; responsáveis com `teams.manage` podem fazê-lo para as equipes do respectivo escopo.

As transições são validadas no servidor e registradas no Log de operações como `shift_started`, `shift_paused`, `shift_resumed` e `shift_ended`. A jornada não muda automaticamente o status operacional da equipe, preservando a decisão explícita de disponibilidade. A migração `0018_bitter_exodus.sql` adiciona os campos de pausa e tempo acumulado. Validação: **152 testes aprovados** em 44 arquivos, verificação de tipos e inspeções desktop/móvel concluídas.

## [1.14.22] — 2026-08-22

### Corrigido — reconciliação da fila externa

Foi corrigido o cenário em que um alerta ALRT podia ser recebido e aparecer no Log de teste durante uma transição de publicação, mas não formar a prévia correspondente. Ao consultar **Integrações → Revisões externas**, o AXE agora reconcilia de forma idempotente os eventos `recebido` que ainda não possuem prévia e que chegaram após a publicação da trilha ativa. Eventos anteriores à publicação continuam excluídos para evitar criação retroativa indevida.

O evento identificado no diagnóstico foi recuperado para a fila como prévia pendente, sem criar ocorrência, atribuição, notificação ou despacho. Validação: **149 testes aprovados** em 43 arquivos, verificação de tipos e inspeção da fila reconciliada concluídas.

## [1.14.21] — 2026-08-22

### Integrações — prévia revisável antes da ocorrência

O AXE Dispatch agora mantém a fila **Integrações → Revisões externas**. Um evento ALRT aceito por uma trilha publicada e ativa cria somente uma prévia com os campos mapeados; não há criação automática de ocorrência, atribuição de equipe ou viatura, mudança de situação, notificação externa ou despacho. A confirmação exige `occurrences.create`, cria a ocorrência em transação única e registra o vínculo com o evento, a prévia e a auditoria.

Foi configurada a trilha de homologação **ALRT → revisão humana de ocorrência** com a sequência `Receber dados externos → Início da trilha → Revisar antes de criar ocorrência → Fim da trilha`. Ela permanece marcada como **SIMULAÇÃO / MOCK** e com automação real bloqueada. A validação exige o mapeamento de descrição, endereço e coordenadas para qualquer nó em modo de revisão obrigatória.

Um evento técnico assinado enviado ao receptor local retornou `202 RECEIVED` e gerou uma prévia pendente, sem ocorrência associada. Foram adicionados o guia `GUIA_REVISAO_EVENTO_EXTERNO.md`, a leitura guiada na central de Manuais e Ajuda e testes de autorização da confirmação. Validação: **148 testes aprovados** em 43 arquivos, verificação de tipos e inspeções desktop/móvel concluídas.

## [1.14.20] — 2026-08-22

### Integrações — log de teste de recebimento externo

A página **Integrações → Logs** ganhou o painel **Log de teste de recebimento externo**. Ele registra tentativas aceitas, duplicadas e rejeitadas pelo receptor ALRT ou por aplicações terceiras homologadas, apresentando código HTTP, correlação, origem, tipo de evento validado e diagnóstico seguro. Nenhuma API key, assinatura HMAC, corpo bruto, segredo ou payload digest é exibido ou persistido nesse painel. Uma tentativa controlada confirmou a exibição de `401 INVALID_TIMESTAMP` com efeitos automáticos desativados. Validação: **145 testes aprovados** em 42 arquivos e verificação de tipos concluída.

## [1.14.19] — 2026-08-22

### Workflow Builder — dados externos e início de trilha

O editor visual passou a disponibilizar o nó **Receber dados externos** (`trigger.external_data`) e tornou mais explícita a função do marcador **Início da trilha**. O novo gatilho exige aplicação de origem, conexão de referência, tipo de evento e ambiente de homologação; ele pode iniciar a sequência `dados externos → início da trilha → demais nós → fim da trilha`. A validação bloqueia ambiente produtivo neste nó e mantém API key, HMAC, idempotência, auditoria e ausência de efeitos operacionais automáticos como requisitos do receptor. Validação: **143 testes aprovados** em 42 arquivos e tipos aprovados.

## [1.14.18] — 2026-08-22

### ALRT → AXE — configuração de destino corrigida

Foi gerado o roteiro operacional `CONFIGURACAO_ALRT_PARA_AXE.md` para substituir o destino incompatível `/central-despacho` pelo receptor correto do AXE. O documento fornece URL completa, método, cabeçalhos, assinatura HMAC, envelope, códigos de resposta, retries e checklist, sem expor API key ou segredo. A aplicação dessa configuração no ALRT e o reenvio originado pelo parceiro ainda são necessários para concluir a homologação.

## [1.14.17] — 2026-08-22

### Homologação ALRT → AXE — validação HTTPS assinada

Foi executado um evento técnico assinado contra o endpoint público de homologação. O AXE respondeu `202 RECEIVED` e persistiu o evento com correlação, estado `recebido`, auditoria `received` e `created_incident_id` nulo. Portanto, a recepção HTTPS, API key, HMAC, timestamp e persistência foram verificadas sem gerar ocorrência ou qualquer despacho. O teste operacional originado pelo parceiro ALRT continua pendente antes de qualquer liberação produtiva.

## [1.14.16] — 2026-08-22

### Homologação ALRT → AXE — autorização administrativa

Foi registrada, com auditoria, a pré-aprovação do perfil Administrador para a conexão `despacho-alrt-homologacao`. O modo do receptor foi habilitado exclusivamente como `homologacao`; a prontidão sem API key retornou `401`, confirmando que o serviço está ativo e ainda protegido. O gate administrativo, API key e HMAC continuam obrigatórios. A fila de eventos permanece sem criar ocorrências, alterar situações, atribuir recursos ou despachar equipes. Validação: **141 testes aprovados** em 42 arquivos e checagem de tipos concluída.

## [1.14.15] — 2026-08-22

### Homologação ALRT → AXE — receptor seguro

O receptor `POST /api/integrations/alrt/events` foi adequado ao novo perfil seguro de homologação: envelope estrito, API key, HMAC-SHA256 sobre corpo bruto, timestamp UTC, correlação, idempotência persistida, respostas estruturadas, tratamento de JSON inválido, limitação temporária com `429` e `Retry-After`, auditoria e documentação OpenAPI. A recepção continua protegida por uma pré-aprovação exclusiva de Administrador e não cria ocorrências, atribuições ou despachos automaticamente. Sem modo, credenciais e aprovação válidos, o endpoint retorna `503`.

## [1.14.14] — 2026-08-22

### Integração ALRT — pré-aprovação administrativa protegida

Foi incluído, na conexão de referência **Despacho ALRT — Eventos**, o controle de **Pré-aprovar produção** exclusivo ao perfil Administrador. A ação gera uma decisão auditável para o fluxo ALRT → AXE e registra explicitamente as pendências de contrato versionado, credencial produtiva, homologação autenticada, monitoramento e chave de desligamento. A pré-aprovação não altera `simulation_only`, não habilita requisições externas e não cria ocorrências ou despachos reais. A tela foi inspecionada em desktop e móvel. Validação: **135 testes aprovados** em 42 arquivos e verificação de tipos concluída.

## [1.14.13] — 2026-08-22

### Governança — histórico completo de ações

O **Log de operações** passou a expor de forma mais completa as ações auditadas do AXE Dispatch. A consulta permanece protegida por `audit.view`, imutável e paginada, agora com busca por ação, recurso ou responsável, filtro ampliado de categorias e escolha de 25, 50 ou 100 registros por página. As operações de workflows, execuções, integrações, credenciais, evidências, favoritos e demais recursos auditados receberam rótulos operacionais compreensíveis. A tela mostra o total de registros e o intervalo visível, preservando a navegação por todas as páginas do histórico. Validação: **133 testes aprovados** em 42 arquivos, verificação de tipos e inspeção desktop/móvel concluídas.

## [1.14.12] — 2026-08-22

### Workflow Builder — trilha, ocorrência e automação protegida

O Workflow Builder agora apresenta o painel **Automação real controlada**, no qual é possível registrar o modo solicitado, a regra de início e a conexão de referência. Mesmo quando a intenção é produção protegida, o servidor normaliza a definição para `activationStatus: bloqueada`, exige aprovação e preserva o executor em **SIMULAÇÃO / MOCK**, sem tráfego HTTP, webhook ou credencial operacional. A versão v7 do workflow **triagem de iluminação** foi auditada com a sequência explícita `Execução manual → Início da trilha → Preencher ocorrência → despacho simulado → Feedback visual → Fim da trilha`.

O nó **Criar ocorrência** passou a expor campos para categoria, prioridade, situação, origem, solicitante, contato, descrição, endereço, latitude, longitude, equipe e viatura. A validação verifica valores permitidos, identificadores positivos e faixas de coordenadas, além de garantir um único início/fim quando a trilha usa marcadores, entrada no início, terminalidade no fim e alcance a partir do gatilho. Validação: **132 testes aprovados** em 42 arquivos, verificação de tipos e inspeções desktop/móvel concluídas. Nenhuma chamada externa, ocorrência real ou despacho de campo foi criado.

## [1.14.11] — 2026-08-22

### Workflow de triagem — feedback e histórico simulado

O workflow **triagem de iluminação** evoluiu para a versão v6 com o nó **Feedback visual de despacho**, conectado após o despacho simulado e configurado para o painel interno. O editor passou a oferecer **Testar falha**, que gera uma falha controlada sem efeitos externos, e um histórico detalhado no próprio workflow, com status, tentativas, etapas, logs, atualização e reprocessamento. O ciclo de retry foi validado de ponta a ponta: as execuções #120001 e #120002 falharam de forma controlada; a #120003 chegou a dead-letter na terceira tentativa. A interface foi inspecionada em desktop e móvel. Validação: **131 testes aprovados** em 42 arquivos, verificação de tipos e nenhuma chamada externa.

## [1.14.10] — 2026-08-22

### Correção de execução simulada de workflows

Foi corrigida a validação de direção no Workflow Builder. Gatilhos não podem receber conexões de entrada, nós operacionais precisam ser alcançáveis a partir de um gatilho e a publicação/executação rejeita grafos desconectados ou invertidos. O executor passou a respeitar a direção do grafo, não a ordem visual dos cartões no canvas. O workflow **triagem de iluminação** foi corrigido em uma versão v5 auditada, com a conexão `Execução manual → despacho de carro`; a execução #90001 foi concluída com duas etapas e zero chamadas externas. O editor agora apresenta o botão **Executar simulação**, que leva à fila de Execuções após a conclusão. Validação: **130 testes aprovados** em 42 arquivos, verificação de tipos e inspeção visual concluídas.

## [1.14.9] — 2026-08-22

### Conexão de homologação do Despacho ALRT

Foi cadastrada e reativada a conexão de referência **Despacho ALRT — Eventos** para `https://despachoalrt-hjwc4f8q.manus.space/eventos`. O registro é auditável, marcado como **ATIVA PARA HOMOLOGAÇÃO** e permanece isolado: `simulation_only = true`, autenticação pendente e entrega HTTP desativada. A tela de Conexões passou a disponibilizar a ação de reativação e a diferenciar visualmente referências ativas para homologação de conexões desativadas. A persistência, a auditoria e a interface foram verificadas em desktop e móvel; a suíte contém **128 testes aprovados** em 42 arquivos.

## [1.14.8] — 2026-08-22

### Receptor ALRT — chave de API e revogação

O receptor de homologação do ALRT foi adaptado para aceitar futuramente uma chave no cabeçalho `X-ALRT-API-Key` e ganhou a verificação autenticada de prontidão em `GET /api/integrations/alrt/health`. A configuração é estrita: somente `ALRT_INGRESS_MODE=homologacao` com chave de ao menos 32 caracteres habilita a rota; qualquer outro estado devolve `503`. Conforme solicitado, a chave de homologação foi removida e o modo foi definido como `desativado`. A verificação HTTP confirmou o bloqueio seguro da rota após o reinício. Validação: **126 testes** previstos em 42 arquivos, incluindo cenário de revogação.

## [1.14.7] — 2026-08-22

### Receptor de alertas ALRT em homologação

Foi preparada a rota `POST /api/integrations/alrt/events` para o futuro recebimento do evento `alert.received` do Despacho ALRT. O receptor permanece **desativado por padrão** e, sem variáveis de homologação e segredo HMAC autorizados, devolve `503 ALRT_INGRESS_DISABLED`. Quando habilitado para homologação, ele aceitará somente envelope JSON versão 1.0, ambiente `homologacao`, assinatura válida, timestamp recente, dados mínimos de ocorrência e coordenadas válidas. Os eventos passam para a fila auditável `alrt_incoming_events`; não há criação de ocorrência, despacho automático, tráfego de saída ou credencial real ativada nesta versão. A migração `0016_broad_richard_fisk.sql` foi aplicada. Validação: tipos e **123 testes** aprovados em 42 arquivos; rota confirmada bloqueada por padrão.

## [1.14.6] — 2026-08-21

### Manuais e Ajuda

Foram adicionados **favoritos pessoais persistidos** para guias e perguntas frequentes, com criação e remoção auditáveis por usuário. A central agora inclui os guias detalhados de **Equipes** e **Viaturas**, além de duas novas respostas na FAQ. Também foi disponibilizado um formulário de sugestão de perguntas, que grava a demanda como **pendente** para avaliação, sem publicação automática, e permite ao autor acompanhar suas próprias sugestões. A migração `0015_funny_lucky_pierre.sql` cria as tabelas privadas de favoritos e sugestões, ambas vinculadas ao usuário autenticado. A validação final contém **121 testes aprovados** em quarenta e um arquivos, verificação de tipos e inspeção visual desktop/móvel concluídas.

## [1.14.5] — 2026-08-21

### Manuais e Ajuda

A central de ajuda passou a oferecer busca por palavras-chave com normalização de acentos, filtrando simultaneamente os guias e as Dúvidas Frequentes. Foram adicionados os guias operacionais de **Gestão de Ocorrências** e **Aplicativo Agente**, cobrindo registro, priorização, localização consentida, atendimento, transições e evidências. A FAQ interativa agora responde a dúvidas sobre permissões, simulação, dead-letter, dados de ocorrência, exportação, acesso de campo, localização e anexos. A inspeção visual foi concluída em desktop e móvel; a validação automatizada contém **119 testes aprovados** em quarenta arquivos.

## [1.14.4] — 2026-08-21

### Manuais e Ajuda

Foi criada a rota **Manuais e Ajuda** e um acesso persistente na parte superior do portal: botão textual em desktop e ícone acessível em dispositivos móveis. A central reúne leitura guiada do manual de Integrações & Workflows e do guia de Triagem de ocorrência crítica, com orientações rápidas sobre permissões, simulação e dead-letter. A interface é responsiva e preserva a operação exclusivamente em modo simulado. A validação final contém **118 testes aprovados** em quarenta arquivos, verificação de tipos e inspeção visual desktop/móvel concluídas.

## [1.14.3] — 2026-08-21

### Documentação operacional

Foi adicionado o guia detalhado `GUIA_WORKFLOW_TRIAGEM_CRITICA.md`, com a configuração completa do primeiro workflow de referência: **Triagem de ocorrência crítica**. O documento orienta a criação, os seis nós, conexões, validação, publicação, execução de sucesso, falha controlada, retry, consulta de logs e limites técnicos do modo simulado. Nenhum comportamento de integração externa foi ativado.

## [1.14.2] — 2026-08-21

### Documentação operacional

Foi adicionado o manual **Integrações & Workflows** com finalidade, matriz de recursos, fluxo recomendado, criação de workflows, tipos de nós, execuções, conexões, webhooks, placeholders de credenciais, OpenAPI, logs, segurança, solução de problemas e roteiro para futura ativação de fornecedores. O documento deixa explícito que o módulo atual funciona exclusivamente em **SIMULAÇÃO / MOCK**, sem tráfego externo, endpoints publicados ou persistência de segredos.

## [1.14.1] — 2026-08-21

### Análise operacional

O dashboard agora inicia com os últimos trinta dias e compara seus indicadores com o período anterior equivalente, incluindo variações de volume, atendimentos ativos, concluídas e tempos médios. Usuários podem salvar, reaplicar, definir como padrão e remover filtros pessoais de período/equipe; essas preferências são privadas, respeitam o escopo de equipe e têm criação, alteração e exclusão auditadas. Durante a troca de filtros, o painel preserva a última leitura, reduz sua opacidade e informa a atualização em andamento. A validação final contém **117 testes aprovados** em trinta e nove arquivos, verificação de tipos, build e inspeção desktop/móvel concluídos.

## [1.14.0] — 2026-08-21

### Dashboards e relatórios

A área de Dashboards e Relatórios passou a consultar dados operacionais reais, protegida por `reports.view` e respeitando o escopo de equipe. Foram adicionados filtros por período e equipe, indicadores de volume, atendimentos ativos, conclusão, resposta média, gráficos por situação e prioridade, além da tabela do recorte filtrado. Perfis com `reports.export` podem exportar CSV ou PDF; cada solicitação é reconsultada no servidor e registrada no Log de operações com formato, filtros, métricas e quantidade de registros. A biblioteca de PDF é carregada somente ao exportar. A validação final contém **116 testes aprovados** em trinta e nove arquivos, verificação de tipos e build de produção concluídos.

## [1.13.1] — 2026-08-21

### Operação e navegação

Foi corrigida a imagem de runtime do contêiner para manter as dependências necessárias ao servidor publicado; a recuperação foi confirmada por resposta HTTP 200 após o novo healthcheck. O aviso de contingência do mapa foi reduzido a um indicador compacto nas bordas, preservando a visualização da área operacional. Também foi criada a rota **Dashboards e Relatórios**, disponível para perfis da central com permissão de relatórios, com estado inicial vazio e estrutura preparada para indicadores e exportações futuros. A validação contém **114 testes aprovados**, verificação de tipos e build de produção concluídos.

## [1.13.0] — 2026-08-21

### Conteinerização e execução externa

Foram adicionados `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.container.example` e o guia `DEPLOY_CONTEINERIZADO.md`. O ambiente local sobe a aplicação Node.js, MySQL 8, MinIO e uma inicialização idempotente de bucket; as migrações podem ser executadas pelo perfil `tools`. A aplicação agora aceita armazenamento S3 compatível por variáveis de ambiente, preservando o modo de armazenamento gerenciado quando essas variáveis não estão configuradas. A validação aprovou **114 testes** em trinta e oito arquivos, verificação de tipos, build de produção e sintaxe YAML. A execução efetiva de Docker Compose requer uma máquina com Docker, indisponível neste ambiente de validação.

## [1.12.9] — 2026-08-21

### Perfil de usuário

Foi adicionada a foto de perfil na Administração > Usuários. Administradores com permissão de edição podem selecionar JPEG, PNG ou WEBP de até 2 MB, visualizar a prévia e enviar a imagem para armazenamento seguro. A referência é persistida no perfil, exibida na lista administrativa e no rodapé da sessão autenticada; alterações preservam apenas metadados no Log de operações. A validação de assinatura binária impede divergência entre o conteúdo e o tipo declarado. A validação final contém **112 testes aprovados** em trinta e sete arquivos, verificação de tipos e build de produção concluídos.

## [1.12.8] — 2026-08-21

### Administração superior

Foi adicionada a **Reinicialização controlada** para o Super Administrador em Configurações gerais, com prévia contável, motivo obrigatório e confirmação textual específica para cada escopo. O modo **operacional** remove ocorrências e dados simulados, preservando cadastros; o modo **total** remove também usuários, perfis de usuário, vínculos de acesso, equipes e viaturas, preservando exclusivamente o acesso do Super Administrador executor, a estrutura técnica, configurações e o Log de operações. As operações são transacionais e preservam no log o escopo, impacto, motivo e data. A validação final contém **108 testes aprovados** em trinta e cinco arquivos, verificação de tipos e build de produção concluídos.

## [1.12.7] — 2026-08-21

### Qualidade e homologação

Foi adicionada uma matriz de homologação controlada que simula, sem persistir dados reais, o painel operacional, criação de ocorrência, equipes, viaturas, exportação, auditoria, administração de acessos, configuração global e bloqueio de conta inativa. A inspeção documentada de desktop e móvel cobre os principais módulos, e o relatório de homologação prioriza as evoluções para o piloto. A validação final contém **98 testes aprovados** em trinta e dois arquivos, verificação de tipos e build de produção concluídos.

## [1.12.6] — 2026-08-21

### Acessibilidade e navegação

Foi adicionado o atalho global **Ctrl/⌘ + Shift + L** para encerrar a sessão. O comando não é acionado durante a edição de campos de texto, seleção ou conteúdo editável, ignora repetições de tecla e mantém o mesmo tratamento de erro do botão. A combinação está indicada visualmente no rodapé e exposta a tecnologias assistivas por meio de metadados de atalho. A verificação de tipos e a suíte automatizada concluíram com **94 testes aprovados**.

## [1.12.5] — 2026-08-20

### Interface

O botão **Sair** passou a usar o símbolo de **porta aberta**, uma convenção visual mais direta para encerrar a sessão. O rótulo explícito, o tratamento de falhas e o redirecionamento à tela inicial permanecem inalterados. A verificação de tipos e a suíte automatizada concluíram com **93 testes aprovados**.

## [1.12.4] — 2026-08-20

### Corrigido

O encerramento de sessão foi transformado em uma ação direta e persistente no rodapé da navegação. O novo botão apresenta o ícone de saída, o rótulo explícito **Sair** e tratamento de falha visível. Após a confirmação do servidor, a aplicação redireciona de forma explícita à tela inicial, evitando a aparência de que o clique não foi processado.

### Interface

O bloco de usuário recebeu acabamento visual alinhado à paleta azul-petróleo do AXE Dispatch, enquanto a ação de saída utiliza contraste em tom vermelho claro para evidenciar uma ação de encerramento sem comprometer a leitura. O fluxo é coberto por teste automatizado e foi inspecionado visualmente. A validação final contém **93 testes aprovados** em trinta e um arquivos.

## [1.12.3] — 2026-08-20

### Corrigido

O menu agora identifica **Agente de Campo** tanto pelo papel operacional da sessão quanto pelo perfil dinâmico `agente_campo`. Assim, mesmo enquanto uma sessão legada ainda apresenta `operador`, a presença do vínculo de Agente de Campo remove **Central** e **Kanban** e mantém somente a navegação de campo apropriada. A mesma identificação protege os redirecionamentos de rota. A validação final contém **92 testes aprovados** em trinta e um arquivos.

## [1.12.2] — 2026-08-20

### Corrigido

Para o perfil **Agente de Campo**, as entradas **Central** e **Kanban** foram removidas da navegação lateral, mesmo quando o perfil dinâmico contém permissões que normalmente exibiriam essas áreas. Os acessos diretos às rotas `/` e `/kanban` também são redirecionados para `/agente`, evitando que o usuário de campo opere telas da Central por URL.

O perfil mantém o acesso ao **Aplicativo Agente** e às áreas de campo autorizadas. A regra é coberta por testes de navegação por papel operacional. A validação final contém **91 testes aprovados** em trinta e um arquivos.

## [1.12.1] — 2026-08-20

### Corrigido

Foi corrigida a divergência entre o perfil dinâmico **Agente de Campo** e o papel operacional retornado na sessão. A causa era um conjunto de vínculos históricos em que `agente_campo` estava ativo, mas o usuário permanecia salvo como `operador`. A autenticação agora reconcilia esse estado antes de montar o contexto da aplicação, atualizando papel operacional, papel-base e equipe sem depender de novo salvamento manual.

Os vínculos existentes foram reconciliados com registro de auditoria. A verificação confirmou que os perfis dinâmicos ativos de Agente de Campo agora são retornados como `agente` e preservam a equipe vinculada. A suíte final contém **89 testes aprovados** em trinta arquivos.

## [1.12.0] — 2026-08-20

### Corrigido

Foi corrigida a edição de vínculo operacional que podia reverter o perfil ao trocar a equipe antes de a consulta ser atualizada. Agora perfil, equipe e situação são escolhidos localmente e gravados por meio de uma única ação **Salvar vínculo**, eliminando a condição que mantinha a pessoa como Administrador.

### Agente de Campo e acesso

Ao salvar **Agente de Campo**, o sistema exige uma equipe, atualiza o papel operacional, sincroniza o perfil dinâmico `agente_campo` com o escopo da equipe e preserva a auditoria. O perfil dinâmico possui as permissões `occurrences.view` e `occurrences.transition`, necessárias ao Aplicativo Agente.

### Explicações de bloqueio

O Aplicativo Agente agora informa se o bloqueio decorre de conta inativa, perfil diferente de Agente de Campo, ausência de equipe ou permissões dinâmicas incompletas. A administração também passou a usar permissões efetivas, em vez de depender apenas do rótulo operacional Administrador. A suíte final contém **88 testes aprovados** em trinta arquivos.

## [1.11.0] — 2026-08-20

### Adicionado

O painel de **Evidências e anexos** do Aplicativo Agente agora aceita um lote de até **10 arquivos** por seleção. Cada item é validado individualmente antes do envio, permitindo fotos JPEG, PNG, WEBP e documentos PDF de até 8 MB por arquivo.

### Experiência de envio

A interface apresenta a fila de anexos selecionados, permite remover itens antes do envio, recebe uma descrição comum opcional e mostra o progresso agregado do lote. Os arquivos são enviados sequencialmente para preservar a auditoria individual; se algum envio falhar, somente os itens não enviados permanecem na fila para nova tentativa e a mensagem identifica o arquivo afetado.

### Validação

Foram atualizados os testes da interface para múltiplos anexos e validação de formato em lote. A verificação de tipos e a suíte completa foram executadas com sucesso: **85 testes aprovados** em trinta arquivos.

## [1.10.0] — 2026-08-20

### Adicionado

O **Aplicativo Agente** agora permite anexar evidências durante um atendimento aceito, em andamento ou pausado. O agente pode selecionar uma foto pelo dispositivo ou um documento, acrescentar uma descrição opcional e consultar os anexos já registrados na própria ocorrência.

### Segurança e rastreabilidade

São aceitos somente arquivos JPEG, PNG, WEBP e PDF de até 8 MB. O servidor valida tipo declarado, assinatura do conteúdo, tamanho e nome seguro antes de armazenar o arquivo no storage privado. Os metadados ficam vinculados à ocorrência, sem bytes no banco, e cada envio gera evento na linha do tempo e registro no Log de operações. A consulta e o envio verificam usuário ativo, papel de agente, equipe vinculada, escopo da equipe, ocorrência atribuída e estágio válido do atendimento.

### Validação

Foram adicionados testes para formato, assinatura e limite de arquivos, além da interface de seleção e preparação de envio no Aplicativo Agente. A verificação de tipos e a suíte completa foram executadas com sucesso: **79 testes aprovados** em vinte e nove arquivos.

## [1.9.0] — 2026-08-20

### Adicionado

Foram concluídas as **Fases 8, 9 e 10** de **Integrações & Workflows**. A nova tela **API Docs / OpenAPI** apresenta um catálogo interno em OpenAPI 3.1, organizado como contrato técnico de referência e explicitamente identificado como **SIMULAÇÃO / MOCK**. Os caminhos exibidos não são endpoints REST publicados e o teste de contrato registra apenas evidência interna auditável, sem envio de requisição externa.

### Importação e geração simulada

O módulo agora importa documentos **JSON** e **YAML** compatíveis com OpenAPI 3.0/3.1, com limite de tamanho, análise local, extração de operações HTTP, validação de estrutura e mascaramento defensivo de campos sensíveis. Cada operação pode gerar um conector de metadados em modo simulado, vinculado à especificação de origem, desativado e sem URL operacional ou credencial. Nenhum importador busca referências externas, resolve URLs, envia documentos ou dispara fornecedores.

### Segurança e validação

O catálogo exige `apidocs.view`; a importação e o teste exigem `apidocs.test`; e a geração de conectores também exige `integrations.manage`. Foram adicionadas estruturas persistidas e auditáveis para especificações e operações importadas, preservando a separação da operação de despacho. O parser JSON/YAML, o mascaramento, o catálogo interno e a interface foram cobertos por testes; a tela foi inspecionada em desktop e móvel. A suíte final contém **75 testes aprovados** em vinte e sete arquivos.

## [1.8.0] — 2026-08-20

### Adicionado

Foram disponibilizadas as interfaces das **Fases 5, 6 e 7** de **Integrações & Workflows**, todas identificadas de forma explícita como **SIMULAÇÃO / MOCK**. O painel principal agora direciona para **Conexões**, **Webhooks**, **Credenciais** e **Logs**, preservando as áreas já existentes de workflows e execuções.

### Conexões, webhooks e credenciais

A área de **Conexões simuladas** permite criar, editar e excluir metadados de conectores, com endpoint de referência opcional submetido à validação HTTPS e anti-SSRF já aplicada pelo servidor. A área de **Webhooks simulados** permite registrar e remover contratos futuros, incluindo o vínculo opcional a um workflow; nenhum endpoint é publicado ou recebe tráfego. O **Cofre de credenciais** registra somente placeholders e resumos mascarados: não possui campo para token, senha, chave privada ou qualquer segredo real, e o payload cifrado permanece vazio nesta fase.

### Logs e segurança

Foi disponibilizada a consulta de **Logs de integração** com dados sanitizados antes de chegarem à interface. As operações permanecem protegidas por RBAC, registradas na auditoria existente e não geram chamadas a fornecedores externos, nem efeitos sobre ocorrências, equipes ou viaturas. As telas foram verificadas nos formatos desktop e móvel, incluindo estados vazios e de acesso indisponível.

### Validação

Foram adicionados testes de interface para edição de conexão simulada e para a ausência de entrada de segredo no cofre de credenciais. A verificação de tipos e a suíte completa foram executadas com sucesso: **69 testes aprovados** em vinte e cinco arquivos.

## [1.7.0] — 2026-08-20

### Adicionado

Foi implementado o **executor persistido de workflows em SIMULAÇÃO / MOCK**. A execução manual cria um registro de fila, processa cada nó de forma determinística e grava etapas, logs, tempos, saída, falhas controladas e auditoria. A execução permanece restrita ao backend do AXE Dispatch: não realiza requisições externas, não usa credenciais e não produz efeitos nas ocorrências, equipes ou viaturas reais.

### Retry e dead-letter

Falhas controladas podem ser solicitadas explicitamente na confirmação de execução para validar o fluxo operacional. O reprocessamento cria uma nova tentativa encadeada, preservando integralmente as etapas da execução anterior e acumulando a contagem de tentativas. O vínculo de retry é persistido com índice único e chave estrangeira, impedindo duas tentativas filhas para a mesma falha. Ao atingir o limite de três, a tentativa final é encaminhada para **dead-letter** sem criar novas tentativas automáticas. O histórico conserva etapas e logs internos de toda a cadeia para análise.

### Interface e segurança

Foi criada a área **Execuções simuladas**, com histórico responsivo, detalhes por etapa, logs internos e reprocessamento limitado às execuções em falha. As procedures exigem `workflow.execute` para executar ou retry e `logs.view` para consultar o histórico. A interface desktop e mobile foi inspecionada; o estado vazio orienta a publicação e a execução controlada do primeiro workflow.

### Validação

Foram adicionados testes unitários e transacionais para êxito, falha, retry encadeado, dead-letter, logs, auditoria e a restrição única de etapas. A página de execuções também recebeu cobertura de interface para detalhe e reprocessamento. Em sessão autenticada, a cadeia real de uma falha controlada foi validada até a terceira tentativa em **dead-letter**, sem chamadas externas. A verificação de tipos e a suíte completa foram executadas com sucesso: **67 testes aprovados** em vinte e quatro arquivos.

## [1.6.0] — 2026-08-20

### Adicionado

Foi implementado o **Workflow Builder** visual. Cada workflow simulado pode ser aberto em um canvas com paleta de gatilho manual, condição, transformação de dados, criação de ocorrência, despacho e notificação simulados. O editor permite adicionar por clique ou arrastar, mover nós, alterar rótulo, duplicar, excluir, conectar, remover conexões, desfazer, refazer, ampliar/reduzir a visualização e centralizar a composição. Cada tipo de nó possui agora campos próprios de configuração, persistidos na versão do grafo e preservados na reabertura.

### Versionamento e validação

Salvar no editor cria uma nova versão auditável do workflow. A publicação é validada no servidor: exige nós e ao menos um gatilho, além da configuração obrigatória de cada tipo de nó; grafos com nós desconectados ou conexões inválidas são informados durante a edição. Nenhuma ação externa é executada, inclusive pelos nós de ocorrência, despacho e notificação.

### Validação

Foram adicionados testes para a validação de grafos, configuração, persistência de versão, reabertura visual e publicação simulada. A verificação de tipos e a suíte automatizada foram executadas com sucesso: **62 testes aprovados** em vinte e um arquivos, incluindo o fluxo completo de carregamento, seleção, edição e salvamento no editor. O caminho real também foi validado visualmente em sessão autenticada: um workflow simulado salvo como `v2` foi reaberto e reapresentou a configuração persistida de seu gatilho manual. A rota do editor também foi verificada para erro controlado quando o workflow informado não existe.

## [1.5.0] — 2026-08-20

### Adicionado

Foi criada a fundação persistida de **Integrações & Workflows**. O banco agora possui estruturas isoladas para workflows, versões, execuções, etapas de execução, conexões, credenciais, webhooks, logs e catálogo de eventos. A migração `0008_wide_guardsmen.sql` foi aplicada sem modificação de tabelas operacionais existentes.

### Workflows simulados

A tela **Meus Workflows** permite criar rascunhos, editar com versionamento automático, publicar ou desativar para simulação e excluir workflows simulados. Cada ação é protegida por permissões específicas e registrada na trilha de auditoria. A interface não dispara integração externa, não usa credenciais e identifica explicitamente o modo **SIMULAÇÃO / MOCK**.

### Catálogo de eventos

O painel passa a exibir contratos técnicos planejados para `occurrence.*`, `dispatch.*` e `agent.location.updated`, com versão, estado de planejamento e esquema de payload consultável. Os contratos continuam desativados: ainda não existe disparo automático de workflows.

### Validação

O esquema aplicado foi conferido no banco. A verificação de tipos e a suíte automatizada foram executadas com sucesso: **57 testes aprovados** em dezenove arquivos. As telas de workflows e do catálogo foram inspecionadas em desktop e mobile.

## [1.4.0] — 2026-08-20

### Adicionado

Foi criada a **Fase 1** do módulo **Integrações & Workflows**. A nova entrada **Integrações** está disponível na navegação lateral para usuários autorizados e abre um painel responsivo que apresenta a estrutura evolutiva de Workflows, Conexões, APIs, Webhooks, Credenciais, Templates, Execuções e API Docs.

### Segurança e modo de operação

A entrega opera exclusivamente em **SIMULAÇÃO / MOCK**. Não existem chamadas a serviços externos, conectores ativos ou persistência de credenciais nesta versão. O catálogo RBAC recebeu as permissões `workflow.*`, `integrations.*`, `credentials.manage`, `webhook.manage`, `logs.view` e `apidocs.*`, atribuídas aos perfis padrão conforme o princípio de menor privilégio. A consulta do painel é protegida no servidor por `integrations.view`.

### Validação

Foram acrescentados testes para o modo simulado e para a permissão dinâmica de integrações. A verificação de tipos e a suíte completa foram executadas com sucesso: **51 testes aprovados** em dezessete arquivos. O painel também foi inspecionado nos formatos desktop e mobile.

## [1.3.0] — 2026-08-20

### Adicionado

O **Super Administrador** pode configurar manualmente a contingência na área **Configurações gerais > Mapa operacional**. Estão disponíveis três modos globais e auditados: **Automático**, que prioriza Google Maps e alterna para OpenStreetMap em falha; **OpenStreetMap manual**, que ativa diretamente o mapa de contingência; e **Somente Google Maps**, destinado a diagnóstico controlado sem fallback.

### Integração

A escolha é persistida em `general_settings.map_fallback_mode` e aplicada a todos os operadores na abertura da central. A migração `0007_greedy_shinko_yamashiro.sql` foi aplicada sem alteração de dados operacionais existentes.

### Validação

Foram incluídos testes para os três modos de seleção de provedor, além da verificação da configuração persistida e da tela administrativa protegida. A suíte final contém **48 testes aprovados** em dezesseis arquivos.

## [1.2.0] — 2026-08-20

### Adicionado

O mapa operacional passa a ter **contingência online automática**. Se o Google Maps não puder ser carregado, a central exibe um mapa incorporado do OpenStreetMap, preservando o centro operacional e o enquadramento das posições disponíveis de ocorrências e equipes. O painel identifica claramente o modo de contingência, mostra a quantidade de pontos acompanhados, mantém a atribuição ao OpenStreetMap e permite abrir o mapa em nova guia.

### Operação

O operador pode usar **Tentar Google Maps** para retornar ao provedor principal sem recarregar a central. A contingência é exclusivamente online, não realiza pré-download de mapas nem substitui uma solução de mapas offline contratada ou auto-hospedada.

### Validação

Foram incluídos testes para a URL e o enquadramento do fallback. A alternância foi validada visualmente quando o Google Maps ficou indisponível. A suíte final contém **45 testes aprovados** em quinze arquivos.

## [1.1.9] — 2026-08-20

### Corrigido

Foi corrigido o carregamento concorrente do SDK do Google Maps, que produzia avisos de carregamento duplicado e podia concluir a inicialização após o componente já ter sido desmontado, gerando o erro **Map container not found**. O carregador agora compartilha uma única promessa e mantém o script do SDK na página, enquanto a inicialização do mapa é cancelada com segurança durante desmontagens e trocas rápidas de tela.

### Validação

Foram adicionados testes para a guarda de inicialização do mapa. A central foi recarregada após reinício limpo do servidor, sem novos registros do erro de contêiner ou de SDK duplicado no console. A suíte final contém **43 testes aprovados** em quatorze arquivos.

## [1.1.8] — 2026-08-20

### Adicionado

O detalhe de ocorrência disponibiliza **Editar dados** para usuários autorizados, mantendo as regras do ciclo de vida. Para o **Super Administrador**, foi incluída a ação **Excluir permanentemente**, protegida por motivo obrigatório, confirmação textual vinculada ao código da ocorrência e validação definitiva no servidor.

### Auditoria e integridade

A exclusão registra um retrato completo da ocorrência, seus despachos, quantidade de eventos, responsável, motivo e data no Log de operações antes da remoção definitiva. As equipes afetadas retornam à disponibilidade apenas quando não houver outra ocorrência ativa vinculada. Foi criada a tela **Log de operações**, filtrável por recurso e protegida por `audit.view`, para consultar ações auditadas, inclusive exclusões permanentes. Cada entrada possui **Ver detalhes**, que abre os valores anteriores e posteriores; para exclusões, também apresenta o motivo, código da ocorrência, despachos e total de eventos preservados.

### Validação

Foram incluídos testes para confirmação de exclusão, preservação do retrato de auditoria, rótulos e consulta detalhada do Log de operações. A suíte final contém **41 testes aprovados** em treze arquivos.

## [1.1.7] — 2026-08-20

### Adicionado

Os **Escopos organizacionais** agora podem ser editados após a criação. Organizações permitem corrigir código e nome; unidades organizacionais permitem atualizar código, nome, tipo e unidade-pai diretamente na tela administrativa.

### Segurança e auditoria

Cada edição exige a permissão `system.configure` e registra os valores anteriores e posteriores na auditoria. A validação impede códigos duplicados, autoatribuição, vínculos entre organizações diferentes e ciclos na hierarquia de unidades. Quando a unidade-pai é inválida, a interface informa como corrigir a seleção.

### Validação

Foram incluídos testes de hierarquia organizacional e validação visual dos controles de edição. A suíte final contém **36 testes aprovados** em onze arquivos.

## [1.1.6] — 2026-08-20

### Adicionado

A tela **Perfis e acessos** agora permite criar **permissões locais** no padrão `recurso.ação` e perfis locais reutilizáveis. Ambos os itens são persistidos e auditados no servidor, podendo compor a matriz de permissões e os vínculos de usuários.

### Orientação de configuração

Foi incluído um roteiro rápido na própria tela e mensagens didáticas quando uma regra impede a alteração. Os cenários orientados incluem perfis padrão protegidos, escopo incompatível, códigos duplicados de perfil ou permissão, código fora do padrão e ausência de privilégio administrativo.

### Validação

Foram acrescentados testes para as orientações de configuração, incluindo o passo a passo de escopo incompatível no vínculo de perfil. A suíte final contém **34 testes aprovados** em dez arquivos.

## [1.1.5] — 2026-08-20

### Adicionado

Foi criada a área **Administração superior > Configurações gerais**, visível e administrável somente pelo perfil **Super Administrador**. O primeiro módulo permite configurar, com persistência e auditoria, o centro geográfico, zoom, tipo de visualização, camada de trânsito e preparo de ajuste automático do mapa operacional. Também foi adicionado um registro extensível de chaves por seção para futuras configurações globais.

### Segurança e integração

As configurações são protegidas no servidor por validação explícita do perfil Super Administrador; o proprietário técnico mantém acesso de contingência. Usuários sem esse perfil são redirecionados da rota administrativa e a central de despacho consulta os valores persistidos ao abrir o mapa. Foram aplicadas as migrações `0005_unusual_pete_wisdom.sql` e `0006_glossy_piledriver.sql`, que criam as tabelas `general_settings` e `general_setting_entries` sem alterar dados operacionais existentes.

### Validação

Foram validados controle de perfil superior, compilação, persistência de schema e a nova interface. A suíte final contém **30 testes aprovados** em nove arquivos.

## [1.1.4] — 2026-08-20

### Corrigido

A lista administrativa deixa de apresentar o `openId` técnico como nome visível. Ela agora prioriza o nome de exibição, depois o nome corporativo, usa o prefixo do e-mail quando disponível e informa claramente quando a identidade corporativa ainda não foi sincronizada. Também foi acrescentada a ação **Editar** para corrigir dados de identificação já existentes.

### Adicionado

Foi incluído o **pré-cadastro manual de usuários** com nome, e-mail corporativo, matrícula, identificador institucional, telefone, cargo, função operacional, equipe, perfil e escopo inicial. A criação é transacional, auditada, valida perfil e escopo e não cria senhas. No primeiro login corporativo com o mesmo e-mail, o pré-cadastro é vinculado automaticamente à identidade autenticada para evitar duplicidade.

### Validação

Foram adicionados testes para a identificação segura de usuários, geração de identificadores internos, vínculo do pré-cadastro e exigência de equipe para agentes de campo. A suíte final contém **29 testes aprovados** em nove arquivos.

## [1.1.3] — 2026-08-20

### Adicionado

Foi integrado o símbolo de **barco viking estilizado** da **AXE Sistemas** no cabeçalho principal do AXE Dispatch. O mesmo ativo foi configurado como favicon e ícone de tela inicial em dispositivos compatíveis.

## [1.1.2] — 2026-08-20

### Alterado

A identidade do produto foi atualizada para **AXE Dispatch**, com **AXE Sistemas** apresentada como marca institucional. A nova identificação está aplicada ao cabeçalho lateral, à autenticação, ao título do navegador e ao título global do projeto.

## [1.1.1] — 2026-08-20

### Corrigido

Os acionamentos de **Atualizar agora** passam a executar novamente as consultas da respectiva tela, com indicador de processamento, confirmação de atualização e mensagem de erro quando a consulta falhar por indisponibilidade de rede. A ação manual atualiza tanto os dados da ocorrência quanto sua cronologia na tela de detalhe.

### Adicionado

Foi incluído um seletor de cadência compartilhado, com opções de **5 segundos**, **10 segundos**, **30 segundos**, **1 minuto** e **Somente manual**. A escolha é persistida localmente para o operador e aplicada à Central de despacho, Ocorrências, Kanban, Equipes, Viaturas, Aplicativo do agente, detalhes de ocorrência e telas administrativas. Quando a cadência está ativa, a interface informa o limite da próxima atualização.

### Validação

Foram executados verificação de tipos, testes unitários das opções de intervalo e do tratamento de falha de atualização, além de inspeção visual das telas principais. A suíte final contém **22 testes aprovados** em seis arquivos.

## [1.1.0] — 2026-08-20

### Adicionado

Foi adicionado o módulo de controle de acesso dinâmico baseado em RBAC. A administração agora possui telas de **Usuários**, **Perfis e permissões** e **Escopos organizacionais**, com filtros, paginação, perfis padrão, criação e duplicação de perfis personalizados, matriz de permissões e vínculo de usuários a organização, unidade ou equipe.

### Segurança e auditoria

As procedures operacionais exigem permissões dinâmicas e validam escopo sobre equipes, organizações e unidades. As regras legadas permanecem apenas como restrições complementares de propriedade durante a migração. Alterações de usuários, papéis, escopos, vínculos e ajustes do catálogo são registradas na trilha de auditoria. Perfis padrão não permitem alteração de matriz ou desativação.

### Validação

A versão inclui migrações não destrutivas para RBAC e escopo de equipes, testes adicionais de permissões, escopos e proteção de perfis, além de inspeções das telas administrativas em desktop e móvel.

## [1.0.0] — 2026-08-19

### Adicionado

Foi estabelecida a primeira versão operacional do Dispatch. Ela inclui gestão de ocorrências, equipes, viaturas, jornadas, Kanban, aplicativo responsivo do agente, geolocalização consentida, atualização automática, controle de acesso por perfil operacional, auditoria por inserção, mapa com contingência, testes unitários e documentação de produção.

### Segurança e dados

A autorização é aplicada no servidor para os perfis operacionais existentes. A trilha de auditoria é registrada pelas procedures de negócio; o endurecimento nativo de imutabilidade no banco permanece documentado como parte da migração definitiva para PostgreSQL.

### Notas de implantação

O checkpoint de referência da versão `1.0.0` é `52965b5e`. Antes de piloto, devem ser concluídas a homologação de Google Maps e localização em dispositivos reais e a decisão sobre a infraestrutura PostgreSQL definitiva.
