# D-011A — Health & Watchdog Foundation + Visual Story State Monitor

## 1. Objetivo

Evoluir a fundação de saúde operacional já existente no Dispatch para uma arquitetura tipada de health registry e watchdog passivo, preservando os endpoints atuais de liveness/readiness e criando uma base segura para os próximos blocos de resiliência e autorregeneração.

O D-011A também introduz um indicador visual de estado das histórias/épicos governados pelo Prompt Mestre, tornando explícito no sistema em qual estado cada história se encontra, quando entrou nesse estado, qual foi o estado anterior e qual é o próximo gate permitido.

O D-011A não executa restart, failover, rollback, correção automática de banco ou qualquer ação destrutiva. Nesta etapa o watchdog observa, classifica e registra; recuperação ativa pertence ao D-011B.

## 2. Estado atual

O backend já possui `server/_core/operationalHealth.ts`, com:

- `/health/live` retornando liveness do processo;
- `/health/ready` avaliando banco de dados e storage;
- timeout por verificação;
- retorno HTTP 503 quando a readiness falha.

Também existe `server/_core/heartbeat.ts`, usado para agendamentos periódicos externos. Esse mecanismo pode ser reutilizado quando apropriado, mas não será tratado como equivalente ao watchdog interno.

Portanto, o D-011A deve evoluir a fundação existente e não criar um segundo subsistema paralelo de health.

## 3. Abordagem arquitetural aprovada

Adotar **Health Registry + Watchdog Passivo**.

A arquitetura separa:

1. definição dos componentes e suas probes;
2. classificação do estado operacional;
3. agregação de liveness/readiness;
4. observação periódica pelo watchdog;
5. emissão de transições e telemetria;
6. visualização de saúde técnica;
7. visualização do estado das histórias do Prompt Mestre.

## 4. Modelo de saúde

### 4.1 Estados de componente

Cada componente poderá estar em um dos estados:

- `healthy` — componente disponível dentro dos critérios esperados;
- `degraded` — componente parcialmente disponível ou com desempenho reduzido, mas sem impedir toda a operação;
- `unhealthy` — componente indisponível ou fora de um limite crítico;
- `unknown` — componente ainda não avaliado ou cuja evidência expirou.

### 4.2 Contrato de componente

Cada componente registrado deve possuir, no mínimo:

- identificador estável;
- nome de apresentação;
- criticidade;
- indicação se bloqueia readiness;
- timeout da probe;
- validade máxima da última evidência;
- função de probe;
- política de classificação;
- metadados sanitizados para observabilidade.

O registry não deve conhecer detalhes específicos de MySQL, storage, GIS ou integrações externas. Cada adapter encapsula seu próprio teste.

## 5. Liveness e readiness

### 5.1 `/health/live`

Deve confirmar exclusivamente que o processo da aplicação está operacional.

Não deve consultar banco, storage, GIS, NEO ou Internet.

Uma dependência externa indisponível não deve transformar liveness em falha enquanto o processo ainda estiver apto a responder.

### 5.2 `/health/ready`

Deve informar se a instância está apta a receber tráfego operacional.

Dependências classificadas como obrigatórias podem produzir `503`.

Dependências opcionais podem colocar a plataforma em `degraded` sem necessariamente retirar a instância de serviço.

## 6. Classificação inicial de dependências

Classificação inicial prevista:

| Componente | Criticidade inicial | Comportamento esperado |
| --- | --- | --- |
| Runtime Node | crítica | falha => unhealthy |
| MySQL principal | crítica | falha => unhealthy e bloqueia readiness |
| Storage obrigatório | crítica quando necessário ao fluxo | falha => unhealthy e pode bloquear readiness |
| Configuração crítica | crítica | inválida => unhealthy |
| GIS/OSRM | operacional | falha => degraded quando despacho básico puder continuar |
| NEO/iframe autorizado | integração | falha => degraded |
| serviços acessórios | variável | degraded/unhealthy conforme política explícita |

Nenhuma dependência pode ser considerada crítica apenas por conveniência técnica; a criticidade deve refletir impacto real na continuidade operacional.

## 7. Watchdog passivo

O watchdog executará as probes periodicamente e manterá um snapshot da saúde da instância.

Fluxo:

`probe -> classificação -> comparação com estado anterior -> transição -> observabilidade`

O D-011A não permite:

`falha -> restart automático`

`falha -> failover automático`

`falha -> rollback automático`

Essas ações pertencem aos blocos posteriores de recuperação.

### 7.1 Anti-flapping

A arquitetura deve permitir políticas como:

- N falhas consecutivas antes de declarar `unhealthy`;
- janela temporal mínima;
- recuperação somente após N sucessos consecutivos;
- cooldown entre mudanças de estado;
- deduplicação de eventos repetidos.

Uma latência isolada não deve gerar pane global sem política explícita.

## 8. Visual Story State Monitor

### 8.1 Objetivo

Tornar visível no próprio sistema o estado de cada história/épico controlado pelo Prompt Mestre, incluindo a entrada no estado atual e o próximo gate permitido.

Esse monitor é uma ferramenta de governança e não substitui Git, CI ou aprovação humana.

### 8.2 Estados visuais iniciais

Estados padronizados:

- `backlog`
- `specification`
- `development`
- `testing`
- `tests_green`
- `homologation`
- `approved`
- `ready_to_merge`
- `main`
- `released`
- `blocked`
- `cancelled`

A UI poderá apresentar badges/ícones amigáveis, mas o valor persistido deve usar identificadores estáveis.

### 8.3 Máquina de estados

Transições devem ser explicitamente validadas.

Exemplos de fluxo normal:

`backlog -> specification -> development -> testing -> tests_green -> homologation -> approved -> ready_to_merge -> main -> released`

Exemplos de desvios controlados:

- `testing -> blocked`
- `tests_green -> blocked`
- `homologation -> blocked`
- retorno de um estado para `development` quando houver correção necessária.

Transições proibidas devem falhar fechado. Exemplo:

`development -> approved`

não é permitido sem os gates intermediários definidos.

### 8.4 Fonte de verdade inicial

Para o primeiro slice do D-011A, a fonte de verdade será um **manifesto de governança versionado no Git**, evitando nova migration apenas para esta funcionalidade.

Caminho proposto:

`docs/governance/story-state.json`

Cada entrada deve conter no mínimo:

- `id` da história/épico;
- `title`;
- `state`;
- `enteredAt`;
- `previousState`;
- `nextAllowedStates`;
- `gate`;
- `evidence` com referências de commit/PR/workflow quando aplicável;
- `updatedBy` quando conhecido e apropriado.

O histórico do Git fornece trilha auditável das mudanças do manifesto.

A aplicação consumirá o manifesto por meio de contrato backend somente leitura. O cliente não poderá enviar `state`, `tenantId`, identidade ou evidência como autoridade.

Uma persistência de runtime em banco poderá ser avaliada futuramente caso seja necessária edição operacional pelo produto.

### 8.5 Validação do manifesto

Deverá existir schema fechado e validação automatizada para impedir:

- estado desconhecido;
- data inválida;
- história duplicada;
- transição proibida;
- evidência incompatível com o gate;
- regressão de estado sem justificativa explícita;
- salto direto para `approved`, `main` ou `released` sem os estados obrigatórios.

### 8.6 Pontos visuais

A primeira implementação deve permitir dois pontos de visualização:

1. **cabeçalho/card da história/épico** — badge do estado atual, data/hora de entrada, estado anterior, gate atual e próximo estado permitido;
2. **Painel de Governança / Saúde da Plataforma** — visão consolidada das histórias, com filtro por estado e destaque de bloqueios.

O painel deve distinguir claramente:

- saúde técnica da plataforma;
- estado de desenvolvimento/governança das histórias.

Exemplo conceitual:

- `MySQL: healthy`
- `Storage: healthy`
- `GIS: degraded`
- `D-011A: testing`
- `D-010C: main`

## 9. Segurança e privacidade

Endpoints de health e governança não devem expor:

- connection strings;
- credenciais;
- URLs assinadas;
- stack traces;
- nomes internos sensíveis;
- dados de outro tenant;
- segredos de integração.

O endpoint detalhado de saúde/governança deve exigir autorização apropriada quando contiver informações administrativas.

Liveness/readiness públicos devem retornar apenas o mínimo necessário para infraestrutura.

## 10. Persistência

### 10.1 Saúde técnica

O D-011A deve preferencialmente não criar migration para o snapshot técnico. Estado recente pode permanecer em memória e transições podem usar observabilidade/logs existentes.

### 10.2 Estado das histórias

O primeiro slice utilizará o manifesto Git versionado.

Isso preserva auditabilidade sem introduzir tabela de banco apenas para acompanhar o processo de engenharia.

## 11. Critérios de aceite do D-011A

O D-011A será considerado implementado quando:

1. liveness permanecer independente das dependências externas;
2. readiness falhar fechado para dependência crítica;
3. dependência opcional puder degradar sem indisponibilizar toda a aplicação;
4. probes tiverem timeout individual;
5. evidência expirada resultar em `unknown` quando aplicável;
6. transições de saúde forem detectadas e deduplicadas;
7. política anti-flapping estiver coberta por testes;
8. informações sensíveis forem sanitizadas;
9. watchdog não executar recovery ativo;
10. manifesto de histórias possuir schema fechado;
11. transições proibidas do Prompt Mestre forem rejeitadas;
12. a UI exibir estado atual, entrada no estado, estado anterior, gate e próximo estado permitido;
13. existir visão consolidada no painel de governança;
14. suíte TDD e gates finais estiverem GREEN;
15. nenhum deploy, migration real, grant ou ação destrutiva tiver sido executado automaticamente.

## 12. Estratégia de testes

A implementação seguirá TDD RED -> GREEN.

Cobertura mínima:

- liveness sem dependências;
- readiness com todas as dependências saudáveis;
- MySQL indisponível;
- storage indisponível;
- dependência opcional degradada;
- timeout de probe;
- estado `unknown` por evidência expirada;
- transições e recuperação;
- anti-flapping;
- deduplicação;
- sanitização de erro;
- schema do manifesto de histórias;
- todas as transições permitidas;
- rejeição de saltos de gate;
- leitura backend do manifesto;
- autorização do painel administrativo;
- renderização do badge/card;
- renderização da visão consolidada;
- regressão integral da suíte do projeto.

## 13. Fora de escopo

- restart automático de processo;
- failover automático;
- eleição de líder;
- rollback automático;
- alteração/correção automática de dados de negócio;
- fallback SQLite operacional;
- reconciliação de banco principal/fallback;
- persistência histórica completa de saúde em banco;
- editor visual de estados por usuários comuns;
- deploy produtivo;
- aplicação automática de migrations;
- grants automáticos.

Esses temas ficam para D-011B e blocos posteriores do épico de resiliência.

## 14. Sequência proposta após aprovação desta especificação

1. escrever plano de implementação do D-011A;
2. criar testes RED para registry/health states;
3. evoluir `operationalHealth.ts` sem duplicação;
4. implementar watchdog passivo e anti-flapping;
5. criar schema e manifesto de governança;
6. validar máquina de estados;
7. expor leitura segura no backend;
8. criar badge/card e painel consolidado;
9. executar regressão, security check, TypeScript, build e gates aplicáveis;
10. congelar candidate tree;
11. registrar evidências/checkpoint;
12. abrir PR para homologação e aprovação controlada.
