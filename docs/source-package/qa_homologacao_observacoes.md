# Observações de homologação — AXE Dispatch

## Evidências iniciais

| Data | Ambiente | Estado observado | Resultado | Limitação |
|---|---|---|---|---|
| 2026-08-21 | Produção — `https://dispatchapp-dmbshjft.manus.space` | Abertura da aplicação publicada | O título exibido foi **AXE Dispatch — AXE Sistemas**; o aplicativo iniciou o redirecionamento de autenticação. | Nenhum conteúdo funcional foi exposto sem sessão autenticada. |
| 2026-08-21 | Autenticação Manus | Tela de login exibida após o redirecionamento | O acesso requer conta Manus autenticada. Não foram inseridas credenciais nem realizadas alterações de dados. | A inspeção de fluxos autenticados em produção depende de uma sessão de homologação autorizada. |

## Regra de evidência

As ações persistentes permanecem **não executadas** neste momento. A regressão automatizada e o build serão usados para validar cenários controlados sem alterar usuários, perfis, ocorrências, equipes ou configurações reais.

## Inspeção visual autenticada de desenvolvimento

| Área | Estado observado | Resultado visual | Não validado nesta inspeção |
|---|---|---|---|
| Navegação principal | Áreas de Central, Ocorrências, Equipes, Kanban, Aplicativo Agente, Viaturas, Integrações e Administração disponíveis ao perfil de desenvolvimento. | A navegação lateral é consistente; o botão **Sair** mostra o atalho `Ctrl/⌘ + Shift + L`. | A visibilidade para cada perfil real em produção. |
| Viaturas | Dois cartões de recurso foram renderizados com situações operacionais distintas. | Ações de cadastro, atualização manual e alteração de situação estavam visíveis. | Criação, alteração e auditoria persistidas. |
| Kanban | Colunas de ciclo de vida e cartões de ocorrência renderizados. | Instrução de arrastar ou usar seletor por cartão está visível. | Transições por arrastar, validação de regra e atualização persistida. |
| Workflows e execuções | A interface declara explicitamente **SIMULAÇÃO / MOCK** e exibe versões, execução, retry e dead-letter. | O modo sem tráfego externo ficou visível e coerente com a política do produto. | Criação, edição, exclusão e reprocessamento persistidos em ambiente real. |
| Conexões, webhooks e credenciais | Estados vazios e avisos de ambiente protegido renderizados. | Os avisos informam que não há tráfego externo, segredos reais nem payload secreto nesta fase. | CRUD persistido de metadados simulados. |
| Log de operações | Tela de auditoria apresentou registros e controle de filtro. | O log se apresentou como consulta de ações auditadas e ofereceu detalhe por registro. | Conteúdo completo dos detalhes e invariância do histórico sob tentativas de alteração. |

## Inspeção móvel autenticada de desenvolvimento

| Área | Estado observado | Resultado visual | Não validado nesta inspeção |
|---|---|---|---|
| Aplicativo Agente | O perfil autenticado de desenvolvimento não era Agente de Campo. | A tela explicou de forma objetiva que o acesso depende de perfil Agente de Campo e equipe vinculada. | Despacho, aceite/recusa, localização e envio de evidências por um agente real. |
| Ocorrências | Lista, busca, filtros, exportação, criação e atualização manual foram exibidos. | O arranjo móvel organiza as ações e filtros em blocos legíveis. | Submissão, filtros combinados, exportação e transições persistidas. |
| Usuários e acessos | Pré-cadastro manual, busca, filtro e atualização manual foram exibidos. | A orientação explica que o cadastro não cria senha e será associado ao primeiro login corporativo. | Criação e primeiro vínculo de usuário em produção. |
| Configurações gerais | Os parâmetros de mapa e selo de Super Administrador foram exibidos. | Campos e alternadores se mantiveram legíveis em tela estreita. | Salvamento e auditoria de configuração. |
| API Docs e Logs | O catálogo interno, a proteção de simulação e os dados mascarados foram exibidos. | As telas são claras quanto à ausência de tráfego externo e segredos reais. | Importação e testes simulados persistidos. |
| Escopos organizacionais | Organizações, unidades e controles de edição foram exibidos. | A hierarquia permaneceu navegável em layout móvel. | Criação, edição, validação de hierarquia e auditoria. |

## Regressão e cenários controlados

| Verificação | Resultado observado | Escopo |
|---|---|---|
| Regressão automatizada inicial | **94 testes aprovados** em 31 arquivos. | RBAC, acesso, ciclo de vida, mapa, localização, integração simulada, workflow, OpenAPI, evidências, layout e atalhos. |
| Matriz adicional sem persistência | **4 testes aprovados**. | Painel, criação de ocorrência, equipe, viatura, exportação, log, administração de acessos, configuração global e bloqueio de conta inativa. |
| Regressão final | **98 testes aprovados** em 32 arquivos; verificação de tipos aprovada. | Inclui a matriz adicional e todos os testes anteriores. |
| Build de produção | Concluído com sucesso. | Foi emitido aviso de bundle JavaScript principal acima de 500 kB após minificação; não bloqueou a geração. |
| Logs recentes do ambiente de desenvolvimento | Nenhum erro recente de navegador ou requisição HTTP 4xx/5xx foi encontrado na janela consultada. | O log de servidor contém falhas históricas de reinicialização e um erro antigo de cache de módulo, já anterior à inspeção; o servidor atual permaneceu em execução. |

## Decisão sobre dados persistentes de teste

Não foi necessário criar usuários, perfis, ocorrências, equipes, viaturas ou registros de integração persistentes. Os cenários adicionais foram executados por meio de doubles de banco controlados, com identificadores e endereços sintéticos, sem alterar a base operacional. A criação persistente será indicada somente para uma próxima etapa de homologação multiusuário, com ambiente isolado e autorização explícita para o conjunto de dados, responsáveis e limpeza.

## Reinicialização controlada — validação visual sem execução

| Ambiente | Estado observado | Resultado | Ação não executada |
|---|---|---|---|
| Desktop autenticado de desenvolvimento | A tela Configurações gerais exibiu o cartão **Reinicialização operacional controlada**, a prévia por categoria e os itens preservados. | A prévia mostrou 66 registros removíveis, sem incluir usuários, acessos, equipes, viaturas, configurações ou o Log de operações. | O botão de reinicialização não foi confirmado; nenhum dado foi removido. |
| Móvel autenticado de desenvolvimento | O cartão, contagens, aviso e botão permaneceram legíveis e organizados em uma coluna. | A ação destrutiva ficou visualmente separada dos parâmetros de mapa. | O diálogo de confirmação textual e a mutation não foram acionados. |

## Reinicialização total — validação controlada

| Evidência | Resultado |
|---|---|
| Seleção de escopo e confirmação | Teste de interface confirmou que o escopo total altera o aviso e exige a frase específica `ZERAR SOLUÇÃO AXE DISPATCH`. |
| Transação de total | Teste de banco controlado confirmou a inclusão de usuários, perfis, vínculos de acesso, equipes e viaturas somente no escopo total, mantendo a auditoria. |
| Segurança | Nenhuma mutation de reinicialização foi enviada ao banco operacional durante a validação. |

## Foto de perfil — validação visual sem upload

| Ambiente | Estado observado | Resultado |
|---|---|---|
| Desktop autenticado de desenvolvimento | A lista de Usuários exibiu o avatar inicial como fallback ao lado da identificação. | O espaço para a foto mantém a leitura da tabela e não altera os dados existentes. |
| Móvel autenticado de desenvolvimento | O avatar e o nome permaneceram legíveis na coluna de usuário, com ações horizontais preservadas no fluxo da tabela. | A apresentação se adapta a telas estreitas sem ocultar a identificação principal. |

## Dashboards e Relatórios — validação visual inicial

| Ambiente | Resultado |
|---|---|
| Desktop autenticado de desenvolvimento | A nova entrada de menu, o estado vazio e os dois blocos de evolução futura permaneceram alinhados à identidade operacional. |
| Móvel autenticado de desenvolvimento | O título, a mensagem de estado vazio e os blocos auxiliares foram organizados em coluna, sem sobreposição ou rolagem horizontal. |

## Contingência de mapa — validação visual

| Cenário | Resultado |
|---|---|
| Fallback OpenStreetMap ativo | A superfície do mapa permaneceu visível; os cartões de informação ocupam somente as bordas e o aviso de contingência foi reduzido a um indicador compacto. |

## Dashboards e Relatórios — indicadores operacionais

| Ambiente | Resultado |
|---|---|
| Desktop autenticado de desenvolvimento | Os filtros de data e equipe, os quatro indicadores, gráficos de situação/prioridade, tabela de resultado e comandos CSV/PDF foram exibidos sem sobreposição. A base atual não possui ocorrências no recorte, e os estados vazios preservaram a legibilidade. |
| Móvel autenticado de desenvolvimento | Filtros, indicadores e gráficos foram reorganizados em uma coluna; os botões CSV/PDF permaneceram acessíveis acima da tabela rolável. |

## Tendências e filtros pessoais do dashboard

| Ambiente | Resultado |
|---|---|
| Desktop autenticado de desenvolvimento | O período inicial de trinta dias, a comparação com o período equivalente anterior, variações nos cartões e a área de filtros privados foram exibidos sem sobreposição. A ausência de ocorrências permaneceu representada sem dados inventados. |
| Móvel autenticado de desenvolvimento | O seletor, o salvamento, os cartões comparativos e o painel de tendência foram reorganizados em coluna, mantendo as ações Salvar e Excluir alcançáveis e a tabela exportável abaixo dos gráficos. |
