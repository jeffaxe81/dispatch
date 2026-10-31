# AXE Dispatch — desdobramento controlado de 100 funcionalidades candidatas

**Data:** 31/10/2026. **Fonte de escopo:** issue [#195](https://github.com/jeffaxe81/dispatch/issues/195), roadmap original [#123](https://github.com/jeffaxe81/dispatch/issues/123) e o inventário [de 22 frentes](./dispatch-inventario-meta-100-20261031.md). **Repositório:** `jeffaxe81/dispatch`.

> Este documento detalha 100 **capacidades candidatas** dentro das frentes já autorizadas. Não representa 100 funcionalidades novas já implementadas, nem comprova que todas estejam ausentes da base atual. A confirmação de novidade exige análise de lacunas no código, na interface e no banco. Nenhuma funcionalidade fora das frentes listadas foi acrescentada.

## Limite de escopo e regras

- **Quantidade:** 100 itens, sem ultrapassar a meta pedida e sem criar nova frente macro.
- **Estado inicial:** `A verificar` significa especificado e ainda não comprovado como ausente, implementado ou homologado. Não usar esse estado como indicador de percentual entregue.
- **Contagem após auditoria:** itens já existentes devem ser marcados `Existente` e não contar como **novos**; itens duplicados deverão ser consolidados, sem inventar substitutos fora do escopo.
- **Níveis:** P0 = operação segura/controle; P1 = melhoria operacional. Meses seguem o roteiro de 5 meses e não são compromissos de data.
- **Critérios:** cada linha especifica resultado observável para aceite; segurança, idempotência, escopo/tenant e logs continuam obrigatórios nas rotas relevantes.
- **Segurança:** nenhuma migração, grant, envio externo, integração real, ajuste automático de ocorrências, merge de PR Draft ou deploy produtivo é autorizado por este documento. REAL-01/02/03 permanecem gates próprios sem aprovação presumida.
- **Limite de expansão:** se a análise constatar necessidade de uma nova frente ou mais de 100 funcionalidades, **solicitar autorização do responsável antes de incluir**. Não preencher lacunas artificialmente.

## Visão por grupo

| Grupo | Frente(s) oficial(is) | Horizonte | Candidatas | Situação |
|---|---|---|---:|---|
| 1. Painel SLA de operações | R05 | M2 | 10 | A verificar |
| 2. Kanban de triagem e priorização | R05 | M2 | 10 | A verificar |
| 3. Formulários D-008 no fluxo real | R06 | M2 | 10 | A verificar |
| 4. Jornada, escalas e cobertura | R07 | M2 | 10 | A verificar |
| 5. Aplicativo de campo e sincronização segura | R11 | M3 | 10 | A verificar |
| 6. GIS e geolocalização resiliente | R10 | M3 | 10 | A verificar |
| 7. Observabilidade e resposta operacional | R09 | M3 | 10 | A verificar |
| 8. Integração versionada com NEO, CRM e Inventário | R13 | M4 | 10 | A verificar |
| 9. Resiliência e entrega segura de integrações | R14, R15 | M4 | 10 | A verificar |
| 10. Autorização, escopos e auditoria segura | R08, R15 | M2/M4 | 10 | A verificar |
| **Total** | **Somente frentes existentes** | | **100** | **0 homologadas por este documento** |

## Matriz funcional e critérios de aceite

### 1. Painel SLA de operações

**Vínculo com roadmap:** R05. **Janela indicativa:** M2. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F001 | Fila de tarefas por prazo | Exibir tarefas abertas ordenáveis pelo vencimento calculado no servidor. | P0 | **A verificar** |
| AXED-F002 | Contador de tarefas vencidas | Apresentar total de tarefas vencidas sem incluir tarefas concluídas. | P0 | **A verificar** |
| AXED-F003 | Tempo restante por tarefa | Exibir contagem regressiva com horário de referência do servidor e atraso identificado. | P0 | **A verificar** |
| AXED-F004 | Visão SLA por equipe | Filtrar tarefas por equipe autorizada, preservando o escopo organizacional. | P0 | **A verificar** |
| AXED-F005 | Visão SLA por organização | Selecionar somente organizações às quais o usuário tem acesso. | P0 | **A verificar** |
| AXED-F006 | Filtro por gravidade de tarefa | Apresentar tarefas por nível de criticidade sem modificar seu estado. | P0 | **A verificar** |
| AXED-F007 | Detalhamento de prazo congelado | Mostrar o prazo e a regra de SLA usados na criação da tarefa. | P0 | **A verificar** |
| AXED-F008 | Motivo de atraso visível | Diferenciar prazo vencido, aguardando execução e erro de processamento. | P0 | **A verificar** |
| AXED-F009 | Histórico de mudanças do SLA | Consultar alterações auditadas de tarefa sem editar prazos retroativamente. | P0 | **A verificar** |
| AXED-F010 | Resumo de tarefas por estado | Exibir contagens de abertas, em andamento e vencidas usando fonte autorizada. | P0 | **A verificar** |

### 2. Kanban de triagem e priorização

**Vínculo com roadmap:** R05. **Janela indicativa:** M2. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F011 | Tempo real por etapa | Mostrar permanência na etapa a partir de eventos auditados, não da abertura. | P0 | **A verificar** |
| AXED-F012 | Sinalização de gargalos | Destacar colunas cujo tempo médio exceda limite configurado. | P0 | **A verificar** |
| AXED-F013 | Filtro por equipe atribuída | Exibir cartões por equipe dentro do escopo permitido. | P0 | **A verificar** |
| AXED-F014 | Filtro por período de abertura | Consultar ocorrências entre datas selecionadas antes da paginação. | P0 | **A verificar** |
| AXED-F015 | Ordenação por tempo de etapa | Organizar cartões pelo maior tempo na etapa atual. | P0 | **A verificar** |
| AXED-F016 | Motivo obrigatório de priorização | Exigir justificativa em mudança de prioridade e gravá-la na auditoria. | P0 | **A verificar** |
| AXED-F017 | Histórico de movimentações do cartão | Mostrar autor, data e estados anteriores e novos da movimentação. | P0 | **A verificar** |
| AXED-F018 | Paginação completa de colunas | Permitir navegar além dos primeiros 100 registros sem omissões silenciosas. | P0 | **A verificar** |
| AXED-F019 | Visões de Kanban salvas | Recuperar filtros e ordenação próprios do usuário sem alterar dados de terceiros. | P0 | **A verificar** |
| AXED-F020 | Aviso de alteração concorrente | Bloquear atualização baseada em versão desatualizada e solicitar recarga. | P0 | **A verificar** |

### 3. Formulários D-008 no fluxo real

**Vínculo com roadmap:** R06. **Janela indicativa:** M2. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F021 | Modelo de formulário por categoria | Associar um formulário autorizado a uma categoria de ocorrência. | P0 | **A verificar** |
| AXED-F022 | Campos obrigatórios por fase | Validar exigências diferentes para triagem, despacho e encerramento. | P0 | **A verificar** |
| AXED-F023 | Rascunho de formulário operacional | Salvar progresso sem concluir ou mudar o estado da ocorrência. | P0 | **A verificar** |
| AXED-F024 | Validação de campos condicionais | Exigir campos adicionais apenas quando a resposta anterior determinar. | P0 | **A verificar** |
| AXED-F025 | Evidências vinculadas ao formulário | Associar evidência permitida a uma resposta específica sem duplicar bytes. | P0 | **A verificar** |
| AXED-F026 | Versão congelada no preenchimento | Vincular cada submissão à versão do modelo usada no início. | P0 | **A verificar** |
| AXED-F027 | Correção auditada de submissão | Registrar nova revisão sem apagar o conteúdo da versão anterior. | P0 | **A verificar** |
| AXED-F028 | Pré-preenchimento autorizado | Reutilizar dados da ocorrência apenas quando o usuário puder consultá-los. | P0 | **A verificar** |
| AXED-F029 | Revisão por supervisor | Permitir aceitar ou devolver formulário com motivo registrado. | P0 | **A verificar** |
| AXED-F030 | Bloqueio por formulário incompleto | Impedir transição específica quando o gate obrigatório estiver pendente. | P0 | **A verificar** |

### 4. Jornada, escalas e cobertura

**Vínculo com roadmap:** R07. **Janela indicativa:** M2. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F031 | Mapa de cobertura 12×36 | Exibir intervalos planejados por equipe e dia em janela selecionada. | P0 | **A verificar** |
| AXED-F032 | Prévia de alterações de escala | Mostrar conflitos e impacto antes de confirmar modificação. | P0 | **A verificar** |
| AXED-F033 | Alerta de lacuna de cobertura | Identificar período sem membro elegível e avisar supervisão. | P0 | **A verificar** |
| AXED-F034 | Comparação planejado versus realizado | Apresentar início e fim reais ao lado dos horários previstos. | P0 | **A verificar** |
| AXED-F035 | Sinalização de jornada excedida | Apontar sessões acima do limite configurado sem encerrá-las automaticamente. | P0 | **A verificar** |
| AXED-F036 | Fila de correção de anomalias | Organizar pendências de jornada com estado, responsável e motivo. | P0 | **A verificar** |
| AXED-F037 | Passagem de plantão registrada | Associar confirmação de troca ao responsável e horário de transição. | P0 | **A verificar** |
| AXED-F038 | Capacidade de equipe por período | Consultar quantidade de agentes elegíveis em um instante selecionado. | P0 | **A verificar** |
| AXED-F039 | Motivo de inelegibilidade visível | Exibir razão objetiva por membro sem expor dados além do permitido. | P0 | **A verificar** |
| AXED-F040 | Relatório de exceções de escala | Consultar folgas, afastamentos e substituições por intervalo e equipe. | P0 | **A verificar** |

### 5. Aplicativo de campo e sincronização segura

**Vínculo com roadmap:** R11. **Janela indicativa:** M3. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F041 | Última lista autorizada offline | Permitir consulta local temporária apenas dos dados previamente autorizados. | P0 | **A verificar** |
| AXED-F042 | Rascunho local de anotações | Registrar texto offline sem executar mudança de estado da ocorrência. | P0 | **A verificar** |
| AXED-F043 | Fila local de evidências pendentes | Guardar metadados e arquivos de envio sob consentimento e proteção local. | P0 | **A verificar** |
| AXED-F044 | Central de conflitos de sincronização | Listar conflitos de versão que exijam intervenção explícita. | P0 | **A verificar** |
| AXED-F045 | Expiração da sessão offline | Bloquear acesso local e descarte controlado ao expirar a autenticação. | P0 | **A verificar** |
| AXED-F046 | Sincronização sob confirmação | Exigir ação explícita antes de remeter operações pendentes ao servidor. | P0 | **A verificar** |
| AXED-F047 | Status individual do envio | Exibir enviado, pendente e erro por item sem declarar sucesso antecipado. | P0 | **A verificar** |
| AXED-F048 | Controle visível de localização | Permitir ativar e desativar envio da posição com estado explícito. | P0 | **A verificar** |
| AXED-F049 | Identificador idempotente por envio | Evitar duplicidade de anotação ou evidência quando a conexão oscilar. | P0 | **A verificar** |
| AXED-F050 | Limpeza de dados locais ao sair | Eliminar fila e cache sensível na saída da conta segundo política definida. | P0 | **A verificar** |

### 6. GIS e geolocalização resiliente

**Vínculo com roadmap:** R10. **Janela indicativa:** M3. **Prioridade indicativa:** P1.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F051 | Idade da última posição da equipe | Exibir instante e tempo decorrido desde a posição recebida. | P1 | **A verificar** |
| AXED-F052 | Precisão da localização recebida | Indicar margem de precisão quando houver metadados válidos. | P1 | **A verificar** |
| AXED-F053 | Aviso de mapa degradado | Mostrar falha do serviço cartográfico sem ocultar dados operacionais. | P1 | **A verificar** |
| AXED-F054 | Validade do ETA calculado | Informar horário do último cálculo de chegada estimada. | P1 | **A verificar** |
| AXED-F055 | Recalcular rota por solicitação | Atualizar ETA apenas após comando autorizado e registrado. | P1 | **A verificar** |
| AXED-F056 | Falha isolada de provedor de rotas | Manter equipes candidatas visíveis se OSRM não responder. | P1 | **A verificar** |
| AXED-F057 | Validação de geometria recebida | Descartar rotas com coordenadas ou LineString inválidos. | P1 | **A verificar** |
| AXED-F058 | Alerta de posição desatualizada | Sinalizar localização acima do limite de atualização definido. | P1 | **A verificar** |
| AXED-F059 | Filtro de equipes no mapa por escopo | Garantir que marcadores cruzados entre organizações não sejam retornados. | P1 | **A verificar** |
| AXED-F060 | Indicação de posição não disponível | Distinguir sem sinal, sem permissão e sem localização recente. | P1 | **A verificar** |

### 7. Observabilidade e resposta operacional

**Vínculo com roadmap:** R09. **Janela indicativa:** M3. **Prioridade indicativa:** P1.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F061 | Painel de saúde dos serviços | Consultar disponibilidade passiva do núcleo sem executar sondas invasivas. | P1 | **A verificar** |
| AXED-F062 | Monitor de atraso de fila | Exibir lag agregado de processamento com horário do snapshot. | P1 | **A verificar** |
| AXED-F063 | Indicador de itens em quarentena | Contar dead-letter por organização sem revelar payloads. | P1 | **A verificar** |
| AXED-F064 | Falhas por adaptador | Exibir quantidade e classe de erros por integração autorizada. | P1 | **A verificar** |
| AXED-F065 | Busca por correlationId | Localizar eventos correlacionados com campos sensíveis removidos. | P1 | **A verificar** |
| AXED-F066 | Sinalização de heartbeat vencido | Destacar ausência de sinal de serviço além de limite configurado. | P1 | **A verificar** |
| AXED-F067 | Alertas internos configuráveis | Permitir definir limiares sem envio externo automático. | P1 | **A verificar** |
| AXED-F068 | Resumo de tentativas e retries | Mostrar tentativas previstas, aplicadas e próximas janelas de retry. | P1 | **A verificar** |
| AXED-F069 | Histórico de incidentes técnicos | Registrar ocorrência técnica e sua resolução sem mudar ocorrências do cidadão. | P1 | **A verificar** |
| AXED-F070 | Exportação de diagnóstico sanitizado | Gerar relatório sem tokens, credenciais, payloads ou identificadores pessoais. | P1 | **A verificar** |

### 8. Integração versionada com NEO, CRM e Inventário

**Vínculo com roadmap:** R13. **Janela indicativa:** M4. **Prioridade indicativa:** P1.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F071 | Contrato versionado de eventos NEO | Validar versão e estrutura antes de aceitar um evento do NEO. | P1 | **A verificar** |
| AXED-F072 | Correlação com atendimento NEO | Associar IDs externos autorizados à ocorrência sem alterar a origem. | P1 | **A verificar** |
| AXED-F073 | Estado de disponibilidade NEO | Exibir integração configurada, indisponível ou não autorizada. | P1 | **A verificar** |
| AXED-F074 | Vínculo de referência CRM | Associar referência de caso CRM à ocorrência de forma auditada. | P1 | **A verificar** |
| AXED-F075 | Recepção de atualização CRM autorizada | Processar somente eventos de CRM permitidos pelo contrato e tenant. | P1 | **A verificar** |
| AXED-F076 | Mapeamento configurável de campos CRM | Usar allowlist explícita para campos de entrada e seus destinos. | P1 | **A verificar** |
| AXED-F077 | Consulta read-only ao Inventário | Exibir dados de ativos relacionados sem escrever no banco de terceiros. | P1 | **A verificar** |
| AXED-F078 | Atualização visível do snapshot de ativo | Mostrar instante e origem da última informação do Inventário. | P1 | **A verificar** |
| AXED-F079 | Aviso de incompatibilidade de versão | Rejeitar versão externa incompatível com erro e diagnóstico sanitizados. | P1 | **A verificar** |
| AXED-F080 | Configuração de conexão por tenant | Separar URLs, capacidades e habilitação de cada integração por organização. | P1 | **A verificar** |

### 9. Resiliência e entrega segura de integrações

**Vínculo com roadmap:** R14, R15. **Janela indicativa:** M4. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F081 | Deduplicação por chave de evento | Reconhecer eventKey repetida no mesmo tenant sem produzir segundo efeito. | P0 | **A verificar** |
| AXED-F082 | Prévia de reprocessamento | Mostrar impacto e destino de item em quarentena antes de autorizar replay. | P0 | **A verificar** |
| AXED-F083 | Reprocessamento manual com autorização | Exigir aprovação específica e registrar autor do replay executado. | P0 | **A verificar** |
| AXED-F084 | Estado do circuit breaker por destino | Mostrar fechado, aberto ou recuperação por adaptador. | P0 | **A verificar** |
| AXED-F085 | Política de retry por classe de erro | Respeitar intervalo e limite específico para erro transitório e permanente. | P0 | **A verificar** |
| AXED-F086 | Motivos de quarentena visíveis | Distinguir limite de tentativas, rejeição permanente e contrato inválido. | P0 | **A verificar** |
| AXED-F087 | Limite de envio por organização | Aplicar quota isolada por tenant sem impedir operação de outros tenants. | P0 | **A verificar** |
| AXED-F088 | Recibo externo correlacionado | Registrar referência verificável do sistema de destino antes de declarar entrega. | P0 | **A verificar** |
| AXED-F089 | Bloqueio de confirmação obsoleta | Rejeitar receipts recebidos com token ou versão de lease ultrapassados. | P0 | **A verificar** |
| AXED-F090 | Núcleo disponível durante falha externa | Preservar operações locais quando CRM/NEO/Inventário estiver indisponível. | P0 | **A verificar** |

### 10. Autorização, escopos e auditoria segura

**Vínculo com roadmap:** R08, R15. **Janela indicativa:** M2/M4. **Prioridade indicativa:** P0.

| ID | Funcionalidade candidata | Critério objetivo de aceite | Prioridade | Estado |
|---|---|---|---|---|
| AXED-F091 | Leitura de auditoria filtrada por tenant | Restringir registros no banco antes de paginação, totalização e busca. | P0 | **A verificar** |
| AXED-F092 | Escopo de auditoria por equipe | Permitir somente recursos associados à equipe autorizada. | P0 | **A verificar** |
| AXED-F093 | Revisão de permissão dinâmica | Exibir permissões efetivas e de onde vieram sem permitir escalonamento. | P0 | **A verificar** |
| AXED-F094 | Controle por escopo organizacional | Negar leitura e mutação em organização diferente da selecionada. | P0 | **A verificar** |
| AXED-F095 | Acesso à localização por finalidade | Exigir permissão própria de visualização de posições de agentes. | P0 | **A verificar** |
| AXED-F096 | Minimização de dados de auditoria | Mascarar dados pessoais em beforeData/afterData de consultas operacionais. | P0 | **A verificar** |
| AXED-F097 | Trilha de acessos negados | Registrar ação e razão sanitizada para negativas críticas de permissão. | P0 | **A verificar** |
| AXED-F098 | Sinalização de papel expirado | Diferenciar acesso revogado, inativo e vencido para administração. | P0 | **A verificar** |
| AXED-F099 | Prévia de acesso de perfil | Simular permissões do perfil sem executar operações em nome do usuário. | P0 | **A verificar** |
| AXED-F100 | Exportação de auditoria com escopo | Exportar apenas os registros autorizados e registrar a própria exportação. | P0 | **A verificar** |

## Como executar o refinamento sem inflar progresso

1. Conferir cada ID contra implementação atual, telas, contratos tRPC, migrations e testes; registrar links para evidência.
2. Marcar `Existente`, `Lacuna confirmada`, `Parcial`, `Impedimento externo` ou `Fora de escopo (requer consulta)`.
3. Apenas `Lacuna confirmada` pode virar nova issue/PR funcional; não duplicar algo existente.
4. Estabelecer dependências técnicas, atores e riscos; priorizar P0 pelo impacto em segurança e continuidade.
5. Homologar em CI isolado e, quando aplicável, no ambiente real autorizado antes de declarar pronto para produção.

**Resultado desta etapa:** 100 itens desdobrados **para análise**, zero itens classificados como novas implementações somente com base neste documento.
