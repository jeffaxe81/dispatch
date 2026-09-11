# D-011C — Failover e Contingência Simulation-Only

## Status

Design arquitetural aprovado para especificação. Esta etapa define contratos e limites; não autoriza implementação produtiva de failover.

## Contexto

A D-011B encerrou o fluxo de recovery controlado baseado em `restart_component`, com autorização, lease/fencing, safety boundary, execução simulada, evidências, verificação pós-ação e cadeia auditável ponta a ponta.

A D-011C trata um problema diferente: contingência entre origem ativa e um destino alternativo. O objetivo é planejar e provar a elegibilidade de um failover sem executar troca real de serviço, papel, rota ou infraestrutura.

A arquitetura escolhida é um **Failover Planner separado**, para manter recuperação local e contingência como domínios distintos e preservar a D-011B sem ampliar `RecoveryActionKind` nesta fase.

## Objetivo

Construir um subsistema determinístico, auditável e fail-closed capaz de:

1. representar uma topologia lógica de failover;
2. validar se existe um único ativo coerente;
3. avaliar candidatos usando evidência de saúde válida;
4. impedir planos ambíguos ou inseguros;
5. produzir um `FailoverPlan` imutável;
6. simular a execução sem qualquer efeito operacional;
7. produzir evidência verificável da decisão e do resultado simulado.

## Princípio de segurança

A D-011C é **100% simulation-only**.

Nenhuma etapa desta iniciativa pode:

- promover ou rebaixar nó;
- alterar primary/standby em banco;
- alterar DNS, VIP, balanceador, rota, proxy ou endpoint;
- reiniciar serviço, processo, container ou VM;
- invocar systemd, Docker, Podman, Kubernetes, SSH, hypervisor ou API de cloud;
- iniciar restore, rollback, migration ou replicação;
- alterar configuração produtiva;
- habilitar retry/failover automático;
- reutilizar o `RecoveryExecutionBoundary` para uma ação real de failover.

Qualquer evolução para execução real exige uma iniciativa posterior, design próprio, TDD, novos safety gates e aprovação explícita independente.

## Decisão arquitetural

### Opção adotada — Planner de failover separado

O novo fluxo é:

`Health Evidence -> Topology Validation -> Eligibility -> Candidate Selection -> FailoverPlan -> Simulated Adapter -> Evidence Receipt -> Verification`

Motivos:

- evita acoplamento entre restart local e contingência;
- mantém a D-011B estável;
- permite regras anti-split-brain próprias;
- cria um boundary explícito entre planejamento e futura execução;
- facilita testar fail-closed sem side effects.

### Opções rejeitadas

**Ampliar `RecoveryActionKind` com `failover_component`:** rejeitado nesta fase porque sobrecarregaria o fluxo D-011B com semântica de origem/destino, topologia e split-brain.

**Motor genérico de contingência:** rejeitado por YAGNI. Restore, rollback, reroute e outras ações não pertencem ao escopo D-011C inicial.

## Relação com D-011B

D-011C pode reutilizar conceitos, mas não deve reutilizar contratos com semântica incompatível.

Pode reaproveitar como referência:

- `tenantId`;
- `componentId`;
- fencing monotônico;
- reason codes sanitizados;
- evidência temporal;
- comportamento fail-closed.

Não deve, nesta fase:

- alterar `recoveryAction.ts`;
- alterar `recoveryExecutionBoundary.ts`;
- adicionar ações reais ao executor existente;
- reutilizar o namespace de lease `d011b3-v1` como se fosse lease de failover.

D-011C terá contratos/versionamento próprios.

## Modelo de domínio

### FailoverNode

Representa um membro lógico da topologia.

Campos mínimos:

- `nodeId: string`;
- `componentId: string`;
- `role: "active" | "standby"`;
- `generation: number`;
- `enabled: boolean`.

`generation` deve ser inteiro positivo e representa uma geração lógica monotônica da topologia conhecida, não um contador operacional controlado por este módulo.

### FailoverTopology

Campos mínimos:

- `topologyId: string`;
- `topologyVersion: "d011c1-v1"`;
- `tenantId: string`;
- `componentId: string`;
- `generation: number`;
- `observedAt: string`;
- `nodes: readonly FailoverNode[]`.

A topologia é um snapshot somente leitura. O planner não persiste nem modifica topologia.

### FailoverHealthEvidence

Evidência mínima por nó:

- `nodeId: string`;
- `componentId: string`;
- `state: "healthy" | "degraded" | "unhealthy" | "unknown"`;
- `checkedAt: string`;
- `validUntil: string`.

A fonte de saúde pode ser adaptada a partir do `HealthRegistry`, mas D-011C não altera o registry para executar failover.

### FailoverCoordinationContext

Contrato próprio de coordenação:

- `tenantId: string`;
- `componentId: string`;
- `ownerId: string`;
- `fencingToken: number`;
- `topologyGeneration: number`;
- `issuedAt: string`;
- `expiresAt: string`.

O token deve ser inteiro positivo. O contexto deve estar temporalmente válido. A geração deve corresponder exatamente ao snapshot de topologia avaliado.

### FailoverPlan

Plano somente leitura produzido apenas após todas as validações:

- `planId: string`;
- `planVersion: "d011c2-v1"`;
- `tenantId: string`;
- `componentId: string`;
- `sourceNodeId: string`;
- `targetNodeId: string`;
- `topologyId: string`;
- `topologyGeneration: number`;
- `fencingToken: number`;
- `healthEvidenceRefs: readonly string[]`;
- `createdAt: string`;
- `expiresAt: string`;
- `mode: "simulation"`.

O plano não contém comandos executáveis, credenciais, URLs de gestão, shell commands ou instruções de infraestrutura.

## Elegibilidade

Um plano só pode ser criado quando todas as condições abaixo forem verdadeiras:

- tenant não vazio e igual em todos os contratos;
- `componentId` igual em topologia, saúde e coordenação;
- exatamente um nó marcado `active` e habilitado;
- origem corresponde ao único ativo;
- existe pelo menos um standby habilitado;
- destino é diferente da origem;
- destino está `healthy`;
- evidência do destino ainda está válida;
- evidência do source existe e não está temporalmente inválida;
- geração da coordenação corresponde à geração da topologia;
- fencing token é inteiro positivo;
- contexto de coordenação não expirou;
- nenhum nó duplicado ou identidade conflitante existe;
- todos os timestamps críticos são parseáveis;
- o plano terá prazo de validade finito e futuro.

`degraded`, `unhealthy` e `unknown` não são elegíveis como destino na primeira versão.

## Regras anti-split-brain

Estas invariantes são obrigatórias e fail-closed:

1. **Single Active:** exatamente um nó ativo habilitado por topologia.
2. **Source Binding:** `sourceNodeId` deve ser o único ativo observado.
3. **Distinct Target:** target nunca pode ser igual ao source.
4. **Healthy Target:** target precisa estar `healthy` com evidência não expirada.
5. **Generation Binding:** planner só aceita coordenação e topologia da mesma geração.
6. **Fencing Required:** ausência, zero, negativo ou valor não inteiro invalida a decisão.
7. **Tenant Isolation:** qualquer divergência de tenant rejeita a cadeia.
8. **Component Isolation:** qualquer divergência de componente rejeita a cadeia.
9. **No Ambiguous Active Set:** zero ou múltiplos ativos rejeitam a topologia.
10. **No Hidden Mutation:** planner, adapter e verifier não podem modificar topologia, saúde, lease, ledger ou infraestrutura.
11. **No Implicit Fallback:** se nenhum candidato seguro existir, não escolher “o menos ruim”.
12. **Deterministic Selection:** candidatos equivalentes devem usar ordenação determinística explícita, nunca ordem incidental de coleção.

## Seleção de candidato

Na versão inicial, após filtrar apenas candidatos seguros, o planner seleciona deterministicamente pelo menor `nodeId` em ordenação lexical.

Esta regra é intencionalmente simples. Latência, região, capacidade, replicação, custo ou preferência operacional ficam fora do escopo até existirem dados e requisitos aprovados.

Se houver necessidade futura de ranking, será uma evolução versionada do planner.

## Reason codes

### Elegibilidade / topologia

- `FAILOVER_ELIGIBLE`
- `TOPOLOGY_INVALID`
- `MULTIPLE_ACTIVE_NODES`
- `ACTIVE_NODE_MISSING`
- `NO_SAFE_CANDIDATE`
- `SOURCE_TARGET_CONFLICT`
- `TARGET_NOT_HEALTHY`
- `HEALTH_EVIDENCE_MISSING`
- `HEALTH_EVIDENCE_STALE`
- `TENANT_MISMATCH`
- `COMPONENT_MISMATCH`
- `TOPOLOGY_GENERATION_MISMATCH`
- `FENCING_INVALID`
- `COORDINATION_EXPIRED`
- `PLAN_WINDOW_INVALID`

### Simulação

- `FAILOVER_SIMULATED_SUCCESS`
- `SIMULATION_REJECTED`
- `SIMULATION_FAILURE`
- `PLAN_EXPIRED`
- `PLAN_MISMATCH`

### Verificação de evidência

- `EVIDENCE_MISMATCH`
- `EVIDENCE_TIMELINE_INVALID`
- `EVIDENCE_SEMANTICS_INVALID`
- `EVIDENCE_LINK_MISMATCH`

Erros internos não devem vazar mensagens, stack traces, endereços, credenciais ou diagnósticos de infraestrutura.

## Simulated Failover Adapter

O adapter recebe somente um `FailoverPlan` validado.

Capability obrigatória:

- `kind: "failover-simulation"`;
- `version: "d011c3-v1"`.

Saída mínima:

- `planId`;
- `sourceNodeId`;
- `targetNodeId`;
- `status: "simulated_success" | "simulated_rejected" | "simulated_failure"`;
- `reasonCode`;
- `startedAt`;
- `finishedAt`.

A implementação inicial deve ser in-memory e não possuir portas de rede, shell, filesystem operacional, banco ou API externa.

## Evidence Receipt

A D-011C.4 produzirá receipt determinístico com versão própria, contendo pelo menos:

- `eventType: "failover.simulation"`;
- `evidenceVersion: "d011c4-v1"`;
- `evidenceId`;
- `planId`;
- `tenantIdHashContext` apenas no cálculo de integridade, não necessariamente exposto em claro no receipt;
- `componentId`;
- `sourceNodeId`;
- `targetNodeId`;
- `topologyId`;
- `topologyGeneration`;
- `fencingToken`;
- referências de saúde;
- status e reason code da simulação;
- `recordedAt`;
- digest SHA-256 canônico.

O digest serve como identificador determinístico de integridade; não deve ser descrito como assinatura digital ou prova autônoma de origem.

## Verifier

O verifier é puro e recebe receipt + contexto esperado.

Deve verificar:

- versão/event type;
- digest canônico;
- tenant por contexto de hash;
- identidade do plano;
- source/target;
- component;
- geração;
- fencing;
- timeline;
- coerência entre status e reason code;
- vínculo com o plano simulado.

Qualquer inconsistência retorna inválido de forma sanitizada e sem side effect.

## Persistência

Nenhuma persistência é obrigatória para C.1–C.3.

C.4 cria o contrato de receipt e verifier, mas a primeira implementação também permanece pura/in-memory. Persistência, retenção, indexação ou consulta histórica serão tratadas separadamente se necessárias.

## Observabilidade

A D-011C deve produzir dados observáveis sem tornar observabilidade um requisito para decisão segura.

Permitido:

- contadores de planos elegíveis/rejeitados;
- reason codes sanitizados;
- duração de planejamento/simulação;
- correlação por `planId`/`topologyId`.

Proibido:

- logar credenciais;
- registrar comandos de infraestrutura;
- depender do sink de log para permitir failover;
- transformar falha de telemetry em caminho executável.

## Microentregas

### D-011C.1 — Failover Topology & Eligibility Contract

Entrega:

- tipos de topologia, saúde e coordenação;
- validação estrutural;
- reason codes de elegibilidade;
- regras single-active, tenant/component/generation/fencing;
- nenhum planner ainda.

TDD principal:

- topologia válida;
- zero ativos;
- múltiplos ativos;
- nó duplicado;
- tenant/component divergentes;
- fencing/generation inválidos;
- evidência stale/missing.

### D-011C.2 — Failover Planner & Anti-Split-Brain

Entrega:

- seleção determinística;
- criação de `FailoverPlan` imutável;
- validade temporal do plano;
- source/target binding;
- sem side effects.

TDD principal:

- plano válido;
- target diferente do source;
- target healthy;
- nenhum candidato seguro;
- candidatos múltiplos com escolha determinística;
- contexto expirado;
- mismatch de geração/fencing.

### D-011C.3 — Simulated Failover Adapter

Entrega:

- capability própria;
- adapter exclusivamente in-memory;
- sucesso/rejeição/falha simulados;
- validação de identidade do resultado;
- nenhum executor real.

TDD principal:

- sucesso simulado;
- plano expirado;
- plan mismatch;
- capability inválida;
- falha sanitizada;
- teste de boundary garantindo ausência de integrações proibidas.

### D-011C.4 — Failover Evidence Receipt & Verifier

Entrega:

- receipt canônico;
- digest SHA-256;
- verifier puro/fail-closed;
- timeline e cross-link com plano/resultado.

TDD principal:

- cadeia válida;
- digest adulterado;
- tenant incorreto;
- source/target divergentes;
- generation/fencing divergentes;
- timeline inválida;
- combinação status/reason code inválida.

## Estratégia de testes

Cada microentrega segue RED -> GREEN -> hardening, com PR separado e merge apenas após aprovação explícita.

Gates mínimos por head candidato:

- suíte específica da microentrega;
- suíte completa do repositório;
- TypeScript;
- `security:check`;
- build;
- workflows aplicáveis do GitHub.

Testes devem incluir assertions explícitas de ausência de side effects e de imports proibidos quando aplicável.

## Compatibilidade e migração

- nenhuma migration de banco prevista;
- nenhuma mudança de schema prevista;
- nenhuma alteração de `RecoveryActionKind` nesta iniciativa;
- nenhuma alteração de contrato D-011B prevista;
- nenhuma habilitação produtiva automática;
- consumidores futuros devem depender de contratos D-011C versionados, não de internals D-011B.

## Critérios de aceite da D-011C

A D-011C estará concluída quando:

1. topologia e elegibilidade forem validadas fail-closed;
2. planner produzir apenas planos determinísticos e seguros;
3. adapter permanecer comprovadamente simulation-only;
4. evidence receipt/verifier fecharem a cadeia auditável;
5. nenhuma integração operacional real existir no diff;
6. todos os gates estiverem GREEN;
7. documentação/changelog de fechamento estiverem integrados após aprovação explícita.

## Fora de escopo

- failover real;
- promoção/demotion de banco;
- controle de replicação;
- DNS/VIP/load balancer;
- cloud/hypervisor/Kubernetes;
- failback;
- restore/rollback;
- ranking por latência, região ou capacidade;
- multi-site active-active;
- persistência histórica de receipts;
- UI operacional de failover;
- aprovação automática humana ou workflow de change management.

## Gate para uma futura execução real

Uma futura iniciativa de failover produtivo só poderá começar depois de D-011C encerrada e deverá, no mínimo:

- possuir design separado;
- criar capability explicitamente produtiva;
- usar fencing/lease específico de failover;
- definir ownership da promoção/demotion;
- comprovar prevenção de split-brain sob falhas parciais;
- definir rollback/failback separadamente;
- incluir testes de integração em ambiente isolado;
- exigir feature flag default-off;
- exigir aprovação explícita independente antes de qualquer habilitação.

## Baseline

Spec criada a partir de `main` em `bb7ee27a451de15a4559ae26aa1df56180959d24`.

Checkpoint: `checkpoint/pre-d011c-failover-design-20260910`.

Branch de design: `docs/d011c-failover-design-20260910`.
