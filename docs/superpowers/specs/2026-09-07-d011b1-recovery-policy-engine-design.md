# D-011B.1 — Recovery Policy Engine + Dry-Run

Data: 2026-09-07
Status: proposta arquitetural aprovada em conversa; especificação para revisão humana antes do plano de implementação.
Base: `main@f9ac0e0be8cd2f688c5c09a46d20eb7569bded83`

## 1. Objetivo

Introduzir a primeira camada ativa do épico D-011B sem executar qualquer reinicialização real. O D-011B.1 receberá transições sanitizadas do watchdog do D-011A, avaliará políticas de recuperação e produzirá decisões auditáveis em modo dry-run.

O objetivo desta microentrega é provar a política, os limites de segurança e a rastreabilidade antes de existir qualquer adapter que possa reiniciar, matar, migrar, fazer failover ou restaurar componentes.

## 2. Não objetivos

Esta microentrega NÃO deve:

- reiniciar processos, serviços, containers, pods, máquinas ou aplicações;
- matar processos;
- executar rollback, failover, restore, migration ou troca automática de banco;
- chamar diretamente `server/recovery` para disaster recovery;
- expor segredos, stack traces ou erros internos em logs públicos;
- criar dois watchdogs concorrentes;
- alterar o contrato público de `/health/live` ou `/health/ready` sem necessidade;
- disparar ações externas de infraestrutura.

## 3. Princípio arquitetural

O D-011A continua responsável por detectar e estabilizar estados. O D-011B passa a decidir o que poderia ser feito, mas o D-011B.1 apenas simula a ação.

Fluxo:

`HealthRegistry -> HealthWatchdog -> RecoveryPolicyEngine -> RecoveryDecision -> DryRunRecoveryExecutor -> Audit/Observability`

A separação entre detecção, decisão e execução é obrigatória.

## 4. Componentes

### 4.1 RecoveryPolicyEngine

Responsável por transformar uma transição sanitizada em uma decisão de recuperação.

Entrada mínima:

- `componentId`;
- estado anterior e novo estado;
- criticidade;
- timestamp;
- contador/histerese já estabilizados pelo watchdog;
- metadados explicitamente permitidos e sanitizados.

Saída tipada `RecoveryDecision`:

- `decisionId`;
- `componentId`;
- `decision`: `allow_dry_run | suppress | escalate`;
- `reasonCode` enumerado;
- `policyVersion`;
- `attemptNumber`;
- `cooldownUntil` quando aplicável;
- `createdAt`.

Nenhuma decisão deve carregar mensagem de exceção crua, URL com credenciais, query string sensível, SQL, token, cookie ou payload interno.

### 4.2 RecoveryPolicyStore

Abstração responsável pelo estado operacional necessário para avaliar limites. A primeira implementação será in-memory, com interface preparada para persistência futura sem alterar o contrato do Policy Engine.

Deve rastrear por componente:

- última decisão;
- número de tentativas em janela;
- contador de ciclos `healthy` estáveis após abertura do circuit;
- cooldown vigente;
- bloqueio/circuit breaker de recuperação;
- última escalada.

O store não deve alterar o HealthRegistry.

### 4.3 DryRunRecoveryExecutor

Recebe somente decisões `allow_dry_run` e gera um resultado simulado.

Resultado mínimo:

- `decisionId`;
- `componentId`;
- `mode: dry_run`;
- `outcome: simulated | skipped | rejected`;
- `actionType` abstrato e não executável, inicialmente `restart_component` apenas como intenção;
- timestamps sanitizados.

O executor desta fase não pode importar APIs de `child_process`, Docker, Kubernetes, systemd, PM2, SSH, cloud provider ou adapters de infraestrutura.

### 4.4 RecoveryOrchestrator

Camada fina de coordenação que recebe a transição do watchdog, solicita a decisão ao Policy Engine e, somente quando permitido, chama o DryRunRecoveryExecutor.

Responsabilidades:

- garantir idempotência por identidade determinística da transição, não por timestamp isolado;
- impedir duas recuperações simultâneas do mesmo componente;
- registrar decisão e resultado;
- não bloquear o ciclo principal do watchdog por trabalho externo longo.

## 5. Política inicial

A primeira política deve ser conservadora e explícita.

### 5.1 Elegibilidade

Somente uma transição estabilizada para `unhealthy` pode gerar `allow_dry_run`.

`unknown` sempre resulta em `suppress` nesta fase e nunca em tentativa automática de restart.

`degraded` sempre resulta em `suppress` nesta fase.

Uma transição estabilizada para `healthy` nunca gera recovery; ela serve apenas como evidência para eventual fechamento do circuit breaker de recovery.

### 5.2 Allowlist

Cada componente deve declarar explicitamente se é recuperável. Ausência de configuração significa `suppress`.

A configuração deve separar:

- `observable`: pode ser monitorado;
- `recoverable`: pode participar do D-011B;
- `blocksReadiness`: já existente no domínio de health e não deve ser reutilizado como autorização de recovery.

Readiness crítico não equivale a permissão para restart.

### 5.3 Limites

Valores iniciais, parametrizáveis e testados:

- no máximo 1 decisão dry-run ativa por componente;
- cooldown mínimo de 30 segundos após uma decisão permitida;
- máximo de 3 tentativas permitidas em uma janela móvel de 15 minutos;
- a quarta tentativa elegível dentro da janela abre o circuit breaker de recovery e retorna `escalate` com `ATTEMPT_LIMIT_REACHED`;
- enquanto o circuit estiver aberto, novas transições `unhealthy` retornam `suppress` com `RECOVERY_CIRCUIT_OPEN` e não incrementam tentativas;
- o circuit só fecha nesta microentrega após 2 ciclos consecutivos estabilizados em `healthy` observados pelo watchdog depois da abertura;
- qualquer estado não-healthy durante essa recuperação de circuit zera o contador de ciclos healthy;
- não existe reset administrativo do circuit no D-011B.1;
- nenhuma política pode entrar em loop dentro do mesmo ciclo do watchdog.

Esses valores são defaults de software, não SLA operacional definitivo.

## 6. Reason codes

Os motivos devem ser enumerados para auditoria e testes. Conjunto mínimo:

- `UNHEALTHY_ELIGIBLE`;
- `COMPONENT_NOT_ALLOWLISTED`;
- `STATE_NOT_RECOVERABLE`;
- `COOLDOWN_ACTIVE`;
- `ATTEMPT_LIMIT_REACHED`;
- `RECOVERY_CIRCUIT_OPEN`;
- `DUPLICATE_TRANSITION`;
- `RECOVERY_ALREADY_IN_PROGRESS`;
- `POLICY_DISABLED`;
- `INVALID_TRANSITION`.

## 7. Observabilidade e auditoria

O sistema deve produzir eventos estruturados sanitizados, sem exceções cruas.

Eventos mínimos:

- `recovery_policy_evaluated`;
- `recovery_dry_run_started`;
- `recovery_dry_run_completed`;
- `recovery_suppressed`;
- `recovery_escalated`;
- `recovery_circuit_opened`;
- `recovery_circuit_closed`.

Campos permitidos:

- ids técnicos não secretos;
- componentId;
- reasonCode;
- policyVersion;
- attemptNumber;
- duração;
- estado sanitizado.

Campos proibidos:

- credenciais;
- headers de autenticação;
- mensagens cruas de erro;
- stack traces;
- SQL;
- conteúdo de arquivos;
- PII desnecessária.

## 8. Integração com D-011A

O D-011A não deve conhecer detalhes do executor. O ponto de extensão deve ser o callback/evento de transição já sanitizado.

O runtime poderá instalar o RecoveryOrchestrator junto ao watchdog, mas:

- deve continuar idempotente por aplicação;
- deve reutilizar a mesma instância do HealthRegistry;
- não deve criar um segundo scheduler de health;
- falha interna do D-011B não pode derrubar `/health/live`;
- falha do Policy Engine deve resultar em supressão segura e log sanitizado.

## 9. Relação com `server/recovery`

O diretório `server/recovery` existente permanece dedicado a backup, restore, verify e disaster recovery administrativo.

D-011B.1 não deve importar `runRestore`, `runBackup`, CLI de recovery ou adapters de restore.

Uma integração futura entre self-healing e disaster recovery, se existir, deverá ser outro subépico com gate explícito e aprovação separada.

## 10. Segurança

Requisitos obrigatórios:

- fail-closed para autorização de recovery;
- allowlist explícita;
- nenhuma ação real nesta fase;
- idempotência;
- anti-flapping reutilizando a evidência do watchdog;
- rate limit por componente;
- circuit breaker de recovery separado do health state;
- logs sanitizados;
- testes garantindo ausência de imports/execução de restart real;
- nenhuma mutation administrativa nova sem autenticação/autorização específica em fase futura.

## 11. Testes TDD obrigatórios

### Policy Engine

- unhealthy allowlisted -> `allow_dry_run`;
- degraded -> `suppress`;
- unknown -> `suppress`;
- healthy -> nenhuma recuperação e conta evidência apenas quando circuit estiver aberto;
- componente fora da allowlist -> `suppress`;
- cooldown ativo -> `suppress`;
- três tentativas na janela podem ser permitidas; a quarta elegível -> `escalate` e abre circuit;
- circuit open + unhealthy -> `suppress` sem incrementar tentativa;
- dois ciclos healthy consecutivos após abertura -> fecha circuit;
- healthy seguido de não-healthy antes do segundo ciclo -> zera contador de recuperação do circuit;
- transição duplicada não cria nova tentativa;
- policy disabled nunca permite ação.

### Orchestrator

- chama executor somente para `allow_dry_run`;
- não executa duas ações concorrentes no mesmo componente;
- erro no executor é sanitizado e não propaga para derrubar watchdog;
- resultado é correlacionado ao `decisionId`;
- instalação runtime é idempotente.

### Dry-run executor

- sempre produz `mode: dry_run`;
- não executa side effects reais;
- action intent é auditável;
- entradas inválidas são rejeitadas com erro tipado/sanitizado.

### Regressão

- todos os testes D-011A continuam GREEN;
- `/health/live` permanece independente;
- `/health/ready` mantém semântica atual;
- testes do `server/recovery` administrativo continuam GREEN;
- `security:check`, TypeScript, suíte completa e build devem passar.

## 12. Estrutura de arquivos proposta

Estrutura alvo, sujeita ao plano de implementação:

- `server/_core/recoveryPolicy.ts`
- `server/_core/recoveryPolicy.test.ts`
- `server/_core/recoveryPolicyStore.ts`
- `server/_core/recoveryDryRunExecutor.ts`
- `server/_core/recoveryDryRunExecutor.test.ts`
- `server/_core/recoveryOrchestrator.ts`
- `server/_core/recoveryOrchestrator.test.ts`
- ajustes mínimos em `server/_core/operationalHealthRuntime.ts` e/ou `server/_core/index.ts` somente para wiring.

Não mover arquivos de `server/recovery` nesta fase.

## 13. Critérios de aceite do D-011B.1

A microentrega só pode sair de Draft quando:

1. política tipada e versionada estiver implementada;
2. dry-run for a única modalidade possível;
3. não existir adapter real de restart;
4. allowlist, cooldown, attempt limit e circuit breaker estiverem cobertos por testes;
5. idempotência e concorrência por componente estiverem cobertas;
6. logs/eventos estiverem sanitizados;
7. D-011A continuar sem regressões;
8. `server/recovery` administrativo permanecer desacoplado;
9. segurança, TypeScript, suíte completa e build estiverem GREEN;
10. revisão final não tiver findings Critical/Important.

## 14. Fora de escopo / próximos subépicos

- D-011B.2: adapter real de restart controlado;
- D-011B.3: confirmação pós-restart e rollback/fallback;
- D-011B.4: integração com orquestradores externos (Docker/Kubernetes/systemd/cloud), se aprovada;
- D-011C ou subépico separado: failover multi-instância / multi-região;
- disaster recovery automático com restore permanece fora deste fluxo até decisão explícita.

## 15. Decisão recomendada

Implementar primeiro o Policy Engine e o executor dry-run, sem qualquer capacidade de restart real. Somente depois de homologar métricas, reason codes, circuit breaker e comportamento de supressão deve ser discutido o D-011B.2.
