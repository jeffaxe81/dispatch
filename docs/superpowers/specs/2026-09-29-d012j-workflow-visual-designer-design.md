# D-012J — Designer Visual de Workflow

## Objetivo

Evoluir o `WorkflowBuilderPage` já existente para que um administrador autorizado monte, revise e publique um grafo de Workflow sem editar JSON. O designer deve usar somente elementos e configurações permitidos pelo domínio do Workflow, preservar a autoria do servidor e não introduzir execução externa, mutação automática de Ocorrências, migração, deploy ou alteração de `main`.

## Contexto e limites

- A base é `d0be64f` (D-012I), que acrescenta tarefas humanas e SLA congelado.
- O modelo vigente mantém versões imutáveis e estados `draft`, `review`, `published` e `retired`.
- Tenant, permissões e validação de publicação permanecem server-authoritative.
- O builder atual é reutilizado; não será criado um segundo editor nem um formato alternativo de definição.
- A execução segue em simulação e não chama conectores, timers, banco de produção ou recursos de Ocorrência automaticamente.

## Abordagem escolhida

O editor continua sendo uma projeção cliente do contrato de Workflow. A paleta e o inspector refletem o catálogo fechado já validado pelo servidor; salvar e publicar usam a definição normalizada e a validação canônica existente. A interface pode antecipar erros para orientar o usuário, mas nunca substitui a decisão do servidor.

Alternativas descartadas:

1. Editor JSON livre: permitiria configurações fora do catálogo e duplicaria validações complexas no cliente.
2. Novo designer isolado: duplicaria rotas, estado e contrato, aumentando risco de divergência com o executor.

## Experiência do administrador

1. Seleciona um item da paleta autorizada e o coloca no canvas.
2. Conecta nós por uma interação explícita; a tela não cria conexões implícitas.
3. Seleciona um nó e configura somente campos pertinentes ao seu tipo.
4. Observa um painel de validação em tempo real, com erros bloqueantes e avisos separados.
5. Salva o rascunho com resumo da alteração; o estado e a versão vigente ficam sempre visíveis.
6. Publica somente se a validação canônica aceitar a definição e a permissão estiver presente.

## Catálogo fechado

A paleta deve suportar somente tipos aceitos pela definição e liberados ao contexto atual:

- gatilhos manuais e externos homologados;
- decisões no-code autorizadas;
- transformação declarativa de dados;
- tarefa humana, incluindo configuração SLA D-012I;
- formulário D-008 obrigatório quando aplicável;
- passos de ocorrência, despacho e notificação exclusivamente nos modos já permitidos;
- marcadores de início e fim de trilha.

O cliente não envia tipo livre, script, expressão arbitrária, URL de conector, segredo, `organizationId`, `actorUserId` ou `correlationId`. Em especial, decisões relacionam seus dois destinos às conexões declaradas, em vez de aceitar referências de nó não verificadas no inspector.

## Validação e publicação

O cliente apresenta rapidamente: nós ausentes ou desconectados, auto-conexão, conexões para nó inexistente, ausência de gatilho, início/fim inválidos, decisão sem duas saídas distintas e campos obrigatórios incompletos.

No salvamento e, obrigatoriamente, na publicação, o servidor normaliza a definição e reaplica `validateWorkflowDefinition`. A publicação é bloqueada diante de erro; avisos não autorizam ignorar campos críticos. A edição de rascunho não altera uma versão publicada nem recalcula SLA já persistido em tarefas existentes.

## Segurança e auditoria

- Leitura exige `workflow.view`; edição, criação, ativação e exclusão preservam suas permissões existentes.
- O tenant ativo é obtido pelo contexto autenticado, nunca pelo payload do canvas.
- Toda alteração preserva o resumo e a auditoria versionada já existente.
- O designer mostra estado de simulação e bloqueio operacional; não disponibiliza um botão de ativação externa.
- Falhas de renderer/configuração ficam isoladas na tela e não expõem payloads ou detalhes internos.

## Microentregas

### J1 — Catálogo e modelo visual

Unificar a paleta do builder com os tipos realmente aceitos, incluindo tarefa humana, formulário e decisão no-code. Remover do cliente qualquer alternativa que não seja permitida pelo domínio.

### J2 — Conexões e inspector tipado

Adicionar interação explícita de conexão e inspector por nó. Destinos de decisão são derivados/validados pelas arestas; SLA e formulário usam campos restritos.

### J3 — Pré-validação e publicação clara

Exibir relatório de erros/avisos do grafo antes de salvar/publicar e mostrar versão/estado de forma inequívoca, sem alterar a validação canônica no servidor.

### J4 — Hardening e acessibilidade

Cobrir teclado, foco, descrições, estado vazio, erro isolado, tenant/RBAC, tipos desconhecidos, conexões inválidas e regressões de versão publicada.

## Estratégia de testes e gates

Cada microentrega começa em RED e termina em GREEN. A cobertura inclui testes de componente para paleta/canvas/inspector, testes de contrato para normalização e publicação server-authoritative, além de casos adversariais de tenant e permissão.

Antes de PR Draft: `security:check`, TypeScript, testes aplicáveis, build e inspeção de diff. O checkpoint só será criado após as evidências disponíveis; as limitações conhecidas do sandbox para testes que abrem portas TCP serão registradas separadamente, sem serem atribuídas ao D-012J.

## Rollback

O trabalho parte de `d0be64f` e terá branch e checkpoint próprios. Reverter a branch remove somente a projeção visual e seus testes; não há migração, operação produtiva ou alteração de dados a desfazer.
