# Relatório de homologação funcional — AXE Dispatch

**Versão avaliada:** 1.12.6  
**Data:** 21 de agosto de 2026  
**Autor:** Manus AI  
**Ambientes observados:** produção publicada e desenvolvimento autenticado  
**Objetivo:** validar fluxos representativos do AXE Dispatch, registrar limites da evidência e recomendar o que **preservar**, **evoluir**, **consolidar** ou **retirar** do produto.

> **Conclusão executiva:** a versão avaliada está tecnicamente apta para um **piloto controlado**, pois a regressão automatizada, a verificação de tipos e o build concluíram sem falhas. Ainda não há evidência suficiente para classificar a aplicação como pronta para uma operação de campo ampla: faltam homologação persistente multiusuário, sessão autenticada em produção, dispositivos reais de campo e testes de contingência de mapa/rede. [1] [2]

## 1. Escopo e método

Foram combinados quatro tipos de evidência. A regressão automatizada avaliou regras de negócio, permissões e componentes. Uma matriz adicional simulou as cadeias administrativas e operacionais por doubles de banco, sem registrar dados reais. A inspeção visual verificou telas relevantes em desktop e móvel. Por fim, os logs recentes foram verificados para identificar falhas de navegador, rede e servidor durante a inspeção. [1] [2]

| Tipo de validação | Resultado | Alcance | Limite relevante |
|---|---:|---|---|
| Verificação de tipos | Aprovada | Contratos TypeScript do projeto | Não prova comportamento em produção. |
| Regressão automatizada | **98 testes aprovados em 32 arquivos** | RBAC, ocorrências, recursos, auditoria, mapa, localização, agente, evidências, integrações simuladas, workflows, OpenAPI e interface | Não cobre todas as combinações possíveis de dados e permissões. |
| Build de produção | Aprovado | Empacotamento do cliente e servidor | O bundle principal gerou aviso por exceder 500 kB após minificação. |
| Inspeção visual | Desktop e móvel | Principais áreas operacionais, administrativas, de campo e de integração | Não alterou dados e não autenticou uma sessão em produção. |
| Matriz controlada adicional | **4 cenários aprovados** | Painel, ocorrências, equipes, viaturas, exportação, auditoria, acessos, configuração e conta inativa | Usa dados sintéticos em memória; não persiste nem exercita OAuth real. |

Não foram criados usuários, perfis, ocorrências, equipes, viaturas ou integrações persistentes. Esta escolha protegeu a base operacional enquanto ainda permitiu testar contratos e regras com identificadores sintéticos. A próxima rodada, caso desejada, deve usar um ambiente de homologação isolado e um conjunto de usuários de teste previamente aprovado.

## 2. Resultado da matriz funcional

| Domínio | Evidência executada ou observada | Resultado | Estado de homologação |
|---|---|---|---|
| Autenticação e logout | Procedure de logout, botão direto, ícone de porta aberta e atalho `Ctrl/⌘ + Shift + L` foram cobertos. | O atalho ignora repetição e não dispara durante edição de texto. | **Aprovado em teste controlado.** |
| Perfis, permissões e escopos | RBAC, proteção de perfis, hierarquia organizacional, pré-cadastro e bloqueio de conta inativa foram testados; telas móveis de Usuários e Escopos foram inspecionadas. | O modelo separa acesso operacional, perfil dinâmico e escopo de equipe. | **Aprovado em teste controlado; pendente UAT multiusuário.** |
| Ocorrências e despacho | Criação, regras de ciclo de vida, atribuição, transição, exportação e exclusão privilegiada estão cobertas por testes; lista e ações foram observadas em móvel. | Há validação de permissão e de transição. | **Aprovado em teste controlado; pendente gravação real ponta a ponta.** |
| Kanban | A tela desktop exibiu colunas, cartões e orientação para arrastar ou usar seletor. | A representação do funil operacional é coerente com a Central. | **Observado; transição por arrastar não executada.** |
| Equipes, viaturas e localização | Cadastro/status foram testados em contrato; cartões de viatura foram observados; cadência de localização tem testes próprios. | A lógica de recurso e a restrição de equipe estão presentes. | **Aprovado em teste controlado; pendente dispositivo real e GPS real.** |
| Mapa e contingência | Google Maps, fallback OpenStreetMap e preferência de contingência possuem testes unitários; configuração global foi exibida em móvel. | Há desenho de contingência configurável. | **Aprovado em teste controlado; pendente falha real de provedor/rede.** |
| Aplicativo Agente e evidências | Estados de bloqueio, upload por lote, validação de arquivos e autorização estão cobertos; em móvel foi exibida a explicação para perfil sem acesso. | O produto explica por que um usuário não pode atuar como agente. | **Aprovado em teste controlado; pendente teste com Agente de Campo autenticado.** |
| Auditoria | Log de operações e detalhes estão presentes; criação de evidência, alterações, localização e fluxos administrativos são auditados pelos contratos. | A trilha é uma capacidade central e visível. | **Aprovado em teste controlado; pendente inspeção de imutabilidade no banco.** |
| Integrações e workflows | Workflows, fila, retry, dead-letter, conexões, webhooks, credenciais, logs e OpenAPI foram testados e visualizados. | O modo **SIMULAÇÃO / MOCK** está explícito e não realiza tráfego externo. | **Aprovado para simulação. Não representa integração produtiva.** |
| Responsividade e atualizações | Telas-chave foram verificadas em desktop e 375 px; os controles de atualização manual/intervalo possuem testes. | A estrutura móvel é legível, com cabeçalho compacto e ações em blocos. | **Aprovado visualmente em telas selecionadas.** |

## 3. Pontos fortes que devem permanecer

O núcleo de despacho — **Ocorrências, Equipes, Viaturas, Central e Kanban** — deve permanecer como centro do produto. Essas capacidades cobrem o fluxo operacional principal: registrar, priorizar, atribuir, acompanhar e encerrar atendimentos. O Kanban não deve ser tratado como duplicidade da lista de ocorrências: ele serve à decisão rápida de fila, enquanto a lista atende busca, filtros, exportação e controle detalhado.

| Funcionalidade | Decisão | Justificativa | Evolução recomendada |
|---|---|---|---|
| Ocorrências, Central e Kanban | **Manter** | Formam o fluxo central de despacho e acompanhamento. | Incluir indicadores de SLA, tempo em cada status e alertas de atraso. |
| RBAC, escopos e perfis | **Manter** | Protegem operações por função, equipe e nível organizacional. | Criar revisão periódica de privilégios e relatório de acessos efetivos. |
| Aplicativo Agente | **Manter e priorizar** | É o ponto de execução em campo e já possui bloqueios explicativos e evidências. | Completar posse individual do atendimento, offline e notificações. |
| Evidências por lote | **Manter** | Tem valor operacional e auditável para comprovação de atendimento. | Adicionar miniaturas, reenvio individual e política de retenção. |
| Auditoria e Log de operações | **Manter** | É indispensável para rastreabilidade e governança. | Exibir melhor o responsável quando houver identidade disponível e permitir filtros salvos. |
| Contingência Google Maps/OpenStreetMap | **Manter** | Reduz dependência de um único provedor de mapa. | Homologar troca real de provedor e comunicar estado de contingência na Central. |
| Atualização manual e configurável | **Manter** | Permite adequar consumo de rede ao contexto operacional. | Acrescentar estado da última sincronização e revalidação após reconexão. |
| Integrações em SIMULAÇÃO / MOCK | **Manter como laboratório controlado** | Atende a exploração técnica sem expor segredos ou acionar terceiros. | Permanecer desativado para tráfego externo até existir arquitetura de produção aprovada. |

## 4. Funcionalidades a evoluir com prioridade

As recomendações abaixo não removem valor existente; elas reduzem a distância entre um piloto controlado e uma operação de campo confiável.

| Prioridade | Evolução | Motivo | Critério objetivo de aceite |
|---|---|---|---|
| P0 | Homologação multiusuário isolada | A versão não foi exercitada por papéis reais e persistência real em conjunto. | Seis contas sintéticas validam visibilidade, bloqueios, escopo e auditoria sem tocar em produção. |
| P0 | Fluxo real de Agente de Campo | O perfil atual de inspeção mostrou corretamente o bloqueio, mas não o atendimento ativo. | Agente de equipe A recebe despacho, aceita, atualiza status, envia localização e anexa foto/PDF; equipe B é negada. |
| P0 | Testes de mapa e rede em dispositivos reais | Geolocalização e contingência dependem de hardware, permissão e conectividade. | Simular perda do Google Maps e perda/restauração de rede em Android e iOS, registrando o comportamento. |
| P0 | Observabilidade de produção | A inspeção publicada parou no login, portanto não há evidência funcional autenticada em produção. | Dashboard de saúde, erros e tempo de resposta por rota sem expor dados pessoais. |
| P1 | Redução do bundle do cliente | O build apontou JavaScript principal acima do limite recomendado. | Aplicar carregamento sob demanda para áreas administrativas e de integrações; medir redução do bundle inicial. |
| P1 | Identificação do responsável nos workflows | A interface exibiu responsáveis como “Não identificado” em registros observados. | Exibir nome ou identificador seguro do ator, com fallback explícito apenas para ações de sistema. |
| P1 | Centro de atalhos e preferências | O logout já possui atalho; a descoberta pode evoluir. | Tela acessível listando atalhos e opção para desativar comandos globais não críticos. |
| P2 | Relatórios operacionais | Exportação CSV existe, mas falta visão gerencial recorrente. | Painel com volume, tempo por status, taxa de aceite, tempo de deslocamento e evidências pendentes. |

## 5. Funcionalidades a consolidar, adiar ou retirar

Não foi identificado um módulo operacional central que deva ser removido imediatamente. A recomendação é de **consolidação e governança de visibilidade**, não de eliminação de capacidades úteis.

| Item | Recomendação | Racional |
|---|---|---|
| Conexões, Webhooks e Cofre de credenciais simulados | **Consolidar** em uma área técnica com abas, mantendo os avisos de simulação. | Para usuários operacionais, as três telas são especializadas e têm pouca utilidade diária; para integração técnica, continuam necessárias. |
| API Docs/OpenAPI e geração de conectores | **Restringir a perfis técnicos e adiar produção externa.** | O catálogo interno agrega valor de governança, mas não deve ser confundido com API pública ou integração ativa. |
| Workflows simulados e Execuções simuladas | **Manter juntos sob Integrações.** | São complementares: um modela a automação e o outro evidencia o comportamento; não devem aparecer no menu de campo. |
| ComponentShowcase não roteado | **Avaliar retirada do pacote de produção.** | É um artefato de desenvolvimento sem rota exposta na aplicação avaliada; antes de excluir, confirmar se é usado como catálogo interno de design. |
| Menu administrativo detalhado | **Manter segmentado, mas ocultar por perfil.** | Usuários, Perfis, Escopos, Configurações e Log atendem tarefas distintas de governança; unificá-los prejudicaria a clareza para administradores. |

## 6. Riscos e limitações da evidência

| Risco ou limitação | Impacto | Mitigação recomendada |
|---|---|---|
| Produção exigiu login e não houve sessão de homologação disponível. | Não foi possível observar o pós-login publicado. | Criar conta de homologação com dados sintéticos e escopo mínimo. |
| Nenhuma mutação foi submetida pela interface nesta rodada. | Persistência, UI de sucesso/erro e auditoria real permanecem parcialmente não observadas. | Executar roteiro aprovado em ambiente isolado, com limpeza ao final. |
| Aplicativo Agente não foi acessado por perfil de campo real. | Atendimento, geolocalização e upload real em celular ainda requerem validação. | Homologar com dois agentes de equipes distintas em Android e iOS. |
| Integrações são propositalmente mockadas. | Não há evidência de conexão com fornecedores, criptografia real de segredo ou entrega HTTP. | Manter como simulação até aprovar arquitetura de segredos, fila, retries e monitoramento produtivos. |
| Aviso de bundle grande no build. | Pode elevar tempo de carregamento inicial em redes móveis limitadas. | Code splitting, carregamento por rota e medição de desempenho em 4G. |
| Logs históricos continham falhas antigas de reinicialização/cache. | Podem dificultar diagnóstico se voltarem a ocorrer. | Fazer reinicialização limpa e validação de cold start antes do piloto. |

## 7. Roteiro recomendado para a próxima homologação

O próximo ciclo deve ser um **UAT de ambiente isolado**, não uma intervenção na base operacional. A preparação pode criar um Super Administrador, um Despachador, um Supervisor, um Auditor, um Agente da equipe A e um Agente da equipe B — todos sintéticos e com e-mails de homologação. O roteiro deve criar uma ocorrência sintética, atribuída à equipe A, validar a negação à equipe B, aceitar o despacho, atualizar status, registrar localização, anexar uma imagem e um PDF de teste, consultar a auditoria, mudar a contingência de mapa e confirmar que nenhuma integração externa é chamada.

> A aplicação demonstrou boa separação entre operação, administração, campo e laboratório de integrações. A decisão adequada não é reduzir o núcleo funcional; é concluir a validação multiusuário de campo, consolidar as áreas técnicas para diminuir ruído e preparar as integrações produtivas somente depois de uma arquitetura segura de segredos e monitoramento.

## Referências

[1]: ./qa_homologacao_observacoes.md "Caderno de observações e resultados da homologação"
[2]: ./server/homologationMatrix.test.ts "Matriz controlada de homologação sem persistência"
[3]: https://dispatchapp-dmbshjft.manus.space "AXE Dispatch — ambiente publicado"
