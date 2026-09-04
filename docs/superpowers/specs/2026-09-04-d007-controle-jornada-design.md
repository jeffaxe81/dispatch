# D-007 — Controle de Jornada de Trabalho — Design

**Data:** 04/09/2026  
**Projeto:** AXE Dispatch / Projeto Despacho  
**Prioridade:** Alta  
**Status:** Design técnico aprovado em conversa; especificação revisada e aguardando aprovação formal antes do plano de implementação.  
**Base técnica:** `checkpoint/d006e-csp-frame-src-20260904`

## 1. Objetivo

Evoluir o controle de jornada já existente no AXE Dispatch para um módulo histórico, auditável e integrado ao despacho, capaz de representar jornada planejada e realizada de operadores, agentes de campo, despachantes e demais usuários operacionais.

O módulo deve suportar início e encerramento de jornada, pausas e intervalos, escalas fixas e cíclicas — incluindo 12x36 —, cálculo de horas, ajustes auditáveis, relatórios, alertas, status operacional e filtragem de elegibilidade no motor de despacho.

A jornada será tratada como domínio próprio, sem perder compatibilidade com o controle atual das equipes.

## 2. Estado atual preservado

O sistema já possui uma fundação de jornada na entidade `teams`:

- `shiftStartedAt`;
- `shiftEndsAt`;
- `shiftPausedAt`;
- `shiftPausedTotalSeconds`.

O backend já implementa a máquina de estados:

`start -> pause -> resume -> end`

com rejeição de transições incompatíveis. O endpoint `teams.updateShift` respeita escopo de equipe, `teams.manage` e permite ao agente controlar a própria equipe.

A tela de Equipes já apresenta situação atual da jornada, início, tempo acumulado de pausa, tempo líquido e os comandos Iniciar, Pausar, Retomar e Encerrar.

O status operacional da equipe permanece separado da jornada — decisão que será preservada.

### Limitação do modelo atual

Os campos em `teams` representam apenas o estado corrente. Eles não constituem histórico completo de jornadas, não permitem múltiplas sessões, planejamento de escala, apuração histórica, ajustes com antes/depois ou associação individual adequada por usuário.

Esses campos não serão expandidos para concentrar toda a nova funcionalidade. Serão preservados inicialmente como compatibilidade/cache operacional e gradualmente derivados do novo domínio.

## 3. Princípios de arquitetura

1. **Histórico é obrigatório.** Uma jornada encerrada não pode desaparecer quando uma nova jornada começar.
2. **Sessão realizada e escala planejada são entidades diferentes.** Planejamento não deve ser confundido com execução real.
3. **Eventos de jornada são auditáveis.** Ajustes não sobrescrevem silenciosamente a história.
4. **Jornada e status operacional são dimensões distintas.** Estar dentro da jornada não significa estar disponível para despacho.
5. **Elegibilidade deve ser decidida antes do ranking GIS.** Equipes/agentes inelegíveis não devem consumir cálculo de rota.
6. **Sem event sourcing completo.** O modelo será sessão + eventos auditáveis, reduzindo complexidade operacional.
7. **Compatibilidade progressiva.** A tela e o endpoint atuais continuam funcionando enquanto a persistência migra para o novo domínio.
8. **Multi-tenant futuro.** As entidades devem carregar escopo organizacional suficiente para isolamento posterior por tenant.

## 4. Modelo de domínio

### 4.1 `work_shift_schedules`

Representa a regra planejada de jornada.

Campos mínimos propostos:

- `id`;
- `code`;
- `name`;
- `organizationId`;
- `organizationalUnitId` opcional;
- `scheduleType`: `fixed`, `cyclic_12x36`, `custom_cycle`;
- `timezone`;
- `startTimeLocal`;
- `weekdays` opcional para escala fixa;
- `plannedDurationMinutes`;
- `breakPolicyMinutes` opcional;
- `cycleAnchorAt` opcional e obrigatório para escalas cíclicas;
- `cycleWorkMinutes` opcional;
- `cycleRestMinutes` opcional;
- `effectiveFrom`;
- `effectiveUntil` opcional;
- `active`;
- `createdAt`;
- `updatedAt`.

Para 12x36, a regra de referência é 12 horas planejadas de trabalho seguidas por 36 horas planejadas de descanso. O cálculo usará `cycleAnchorAt`, duração do ciclo e timezone explícito, evitando inferência baseada apenas no dia do calendário.

### 4.2 `work_shift_assignments`

Liga uma escala planejada ao recurso operacional.

Campos mínimos:

- `id`;
- `scheduleId`;
- `userId`;
- `teamId` opcional;
- `effectiveFrom`;
- `effectiveUntil` opcional;
- `active`;
- `createdAt`;
- `updatedAt`.

A associação primária será por usuário, permitindo jornada individual. `teamId` funciona como contexto operacional e suporte à compatibilidade com a jornada atual de equipe.

Duas associações ativas e sobrepostas para o mesmo usuário não serão permitidas na fundação. Exceções de escala serão modeladas explicitamente, em vez de resolvidas por prioridade implícita.

### 4.3 `work_shift_schedule_exceptions`

Representa exceções à escala recorrente.

Tipos iniciais:

- `day_off`;
- `replacement_shift`;
- `leave`;
- `extra_call`;
- `holiday_override`.

Campos mínimos:

- `id`;
- `assignmentId`;
- `exceptionType`;
- `startsAt`;
- `endsAt`;
- `reason`;
- `createdByUserId`;
- `createdAt`.

Exceções têm precedência sobre a regra recorrente e precisam de auditoria.

### 4.4 `work_shift_sessions`

Representa uma jornada efetivamente realizada.

Campos mínimos:

- `id`;
- `userId`;
- `teamId` opcional;
- `scheduleAssignmentId` opcional;
- `scheduledStartAt` opcional;
- `scheduledEndAt` opcional;
- `startedAt`;
- `pausedAt` opcional;
- `endedAt` opcional;
- `status`: `active`, `paused`, `ended`, `cancelled`;
- `workedSeconds` materializado ao encerrar;
- `pausedSeconds` acumulado;
- `overtimeSeconds`;
- `lateStartSeconds`;
- `earlyEndSeconds`;
- `source`: `self`, `supervisor`, `admin`, `migration`, `system`;
- `createdAt`;
- `updatedAt`.

A sessão é a fonte de verdade da jornada realizada. Ajustes posteriores não criam um estado `adjusted`; são representados pela trilha de ajuste e pelos eventos correspondentes.

Quando a sessão for iniciada pelo próprio usuário, `teamId` será capturado como snapshot do vínculo operacional vigente do usuário naquele instante. Supervisor/administrador poderá selecionar outro contexto apenas se possuir escopo e permissão adequados.

### 4.5 `work_shift_events`

Trilha cronológica imutável da sessão.

Tipos iniciais:

- `started`;
- `paused`;
- `resumed`;
- `ended`;
- `adjustment_requested`;
- `adjustment_approved`;
- `adjustment_rejected`;
- `adjusted`;
- `auto_warning`;
- `cancelled`.

Campos mínimos:

- `id`;
- `sessionId`;
- `eventType`;
- `occurredAt`;
- `actorUserId` opcional;
- `reason` opcional;
- `beforeData` opcional;
- `afterData` opcional;
- `metadata` sanitizado;
- `createdAt`.

Eventos não serão atualizados ou apagados por fluxo normal.

### 4.6 `work_shift_adjustments`

Representa pedidos e decisões de correção.

Campos mínimos:

- `id`;
- `sessionId`;
- `requestedByUserId`;
- `approvedByUserId` opcional;
- `status`: `pending`, `approved`, `rejected`;
- `reason`;
- `requestedChanges`;
- `beforeSnapshot`;
- `afterSnapshot` opcional;
- `requestedAt`;
- `decidedAt` opcional.

Nenhum ajuste administrativo substituirá silenciosamente a sessão original. A alteração materializada será acompanhada pelo evento `adjusted` e pelos snapshots antes/depois.

## 5. Máquina de estados da jornada

Estados derivados da sessão:

`not_started -> active -> paused -> active -> ended`

Regras:

- uma sessão não encerrada por usuário por vez;
- `pause` exige sessão `active`;
- `resume` exige sessão `paused`;
- `end` aceita `active` ou `paused`;
- ao encerrar durante pausa, o intervalo corrente é acumulado antes do fechamento;
- sessão encerrada não pode ser reaberta por operação comum;
- correções posteriores usam o fluxo de ajuste;
- timestamps enviados pelo cliente não serão fonte autoritativa na operação comum; o servidor registra o instante efetivo;
- ações duplicadas devem ser rejeitadas ou tratadas de forma idempotente pelo contrato, nunca criar duas sessões acidentalmente.

## 6. Compatibilidade com `teams`

Durante a transição:

- `teams.shiftStartedAt`, `shiftEndsAt`, `shiftPausedAt` e `shiftPausedTotalSeconds` continuam sendo preenchidos;
- a gravação primária passa a ocorrer na sessão/eventos;
- a atualização da equipe ocorre na mesma transação quando houver `teamId`;
- a tela atual poderá continuar lendo `teams` na D-007A;
- etapa posterior migrará a tela para consulta derivada da sessão ativa;
- não haverá exclusão imediata dos campos antigos.

Essa estratégia permite rollback de código sem perda da nova trilha histórica.

## 7. Escalas e 12x36

### 7.1 Escala fixa

Permite horário recorrente por dias da semana, duração planejada e política de intervalo.

### 7.2 Escala 12x36

Usará:

- `cycleAnchorAt` como instante do primeiro plantão;
- ciclo total de 48 horas;
- janela de trabalho de 12 horas;
- descanso planejado de 36 horas;
- timezone definido na escala.

O sistema não presumirá que 12x36 significa apenas alternância de datas. Plantões noturnos e futuras mudanças de offset serão calculados por instantes e timezone.

### 7.3 Exceções

Troca de plantão, folga extraordinária, afastamento, convocação e feriado serão representados por `work_shift_schedule_exceptions` e terão precedência sobre a regra recorrente.

## 8. Status operacional x jornada

São controles separados.

Exemplos:

- dentro da jornada + `disponivel` -> potencialmente elegível;
- dentro da jornada + `em_atendimento` -> não elegível para novo despacho normal;
- dentro da jornada + `pausada` -> não elegível;
- fora da jornada + `disponivel` -> não elegível por jornada;
- jornada ativa + ausência de localização recente -> pode ser inelegível por política operacional;
- jornada ativa + equipe fora da região -> pode ser inelegível por escopo/região.

O módulo não alterará automaticamente o status operacional em toda transição de jornada. Regras automáticas futuras exigirão configuração explícita.

## 9. Elegibilidade para despacho

Será criado um serviço independente, conceitualmente:

`evaluateDispatchEligibility(candidate, context)`

Ele será executado antes de `rankTeamCandidates`.

Critérios iniciais:

1. usuário/equipe ativos;
2. escopo organizacional permitido;
3. jornada ativa;
4. jornada não pausada;
5. status operacional permitido;
6. disponibilidade para nova ocorrência;
7. localização válida e suficientemente recente;
8. região/área operacional, quando aplicável.

Somente candidatos elegíveis seguem para pré-seleção geodésica e cálculo OSRM.

O resultado informa motivos de exclusão, por exemplo:

- `outside_shift`;
- `shift_paused`;
- `operationally_unavailable`;
- `already_busy`;
- `stale_location`;
- `outside_scope`;
- `outside_region`.

Esses motivos podem ser exibidos ao despachante e auditados sem expor dados sensíveis.

## 10. Cálculos

### 10.1 Tempo trabalhado

Para sessão encerrada:

`workedSeconds = max(0, endedAt - startedAt - pausedSeconds)`

Para sessão ativa, o fim lógico usado no cálculo é o instante atual do servidor. Se a sessão estiver pausada, o intervalo entre `pausedAt` e o instante atual entra temporariamente no cálculo de pausa.

### 10.2 Horas extras

`overtimeSeconds = max(0, workedSeconds - plannedWorkSeconds)`

A regra pode evoluir para tolerâncias e banco de horas, mas a D-007 não implementará legislação trabalhista completa.

### 10.3 Atraso e saída antecipada

Quando houver escala vinculada:

- atraso = início real posterior ao início planejado;
- saída antecipada = encerramento real anterior ao fim planejado;
- tolerâncias serão configuráveis em evolução posterior.

### 10.4 Intervalos

Serão acumulados por eventos `paused`/`resumed`. A D-007A preserva a semântica de uma pausa corrente por vez, mas suporta múltiplas pausas ao longo da mesma sessão por meio do histórico de eventos.

## 11. Alertas

Alertas previstos:

- jornada não iniciada próxima do horário planejado;
- atraso de início;
- pausa acima do limite configurado;
- jornada acima da duração planejada;
- jornada sem encerramento;
- escala sem cobertura suficiente;
- tentativa de despacho de candidato fora da jornada;
- agente disponível operacionalmente, mas fora da jornada;
- divergência entre sessão ativa e estado legado da equipe.

Alertas serão inicialmente informativos e auditáveis. Ações automáticas só serão adicionadas mediante regra explícita.

## 12. Relatórios

Relatórios mínimos:

- jornadas por usuário;
- jornadas por equipe;
- horas planejadas x realizadas;
- tempo líquido;
- tempo em pausas;
- horas extras;
- atrasos;
- encerramentos ausentes;
- ajustes realizados;
- cobertura por faixa de horário;
- candidatos excluídos do despacho por jornada.

Filtros respeitam escopo RBAC/organizacional. Exportação reutiliza o padrão existente de auditoria de relatórios.

## 13. RBAC

Permissões propostas:

- `work_shifts.view` — consultar jornada conforme escopo;
- `work_shifts.control` — iniciar/pausar/retomar/encerrar a própria jornada;
- `work_shifts.manage` — administrar jornadas do escopo;
- `work_shifts.adjust` — solicitar/aplicar ajustes permitidos;
- `work_shifts.approve` — aprovar/rejeitar ajustes;
- `work_shift_schedules.view` — consultar escalas;
- `work_shift_schedules.manage` — criar/alterar escalas;
- `work_shift_reports.view` — consultar relatórios;
- `work_shift_reports.export` — exportar relatórios.

O wildcard administrativo legado `*` continua compatível.

As novas permissões não serão concedidas automaticamente a perfis existentes, exceto quando houver mapeamento explícito aprovado.

## 14. Auditoria

Devem ser auditados:

- criação/alteração de escala;
- associação de usuário à escala;
- criação/alteração de exceção;
- início/pausa/retorno/fim;
- ajuste solicitado;
- ajuste aprovado/rejeitado;
- alteração administrativa de jornada;
- exportação de relatório;
- decisão de inelegibilidade para despacho quando relevante.

Não registrar credenciais, conteúdo privado sem relação com jornada, localização desnecessária em snapshots de ajuste ou payload externo não sanitizado.

## 15. UX

### 15.1 Agente / operador

A interface mostra:

- estado atual da jornada;
- hora de início;
- tempo líquido;
- tempo de pausa;
- próxima ação possível;
- horário planejado, quando houver escala;
- alerta de atraso/extrapolação quando aplicável.

Os comandos atuais de Iniciar/Pausar/Retomar/Encerrar serão preservados e evoluídos.

### 15.2 Supervisor / administrador

Nova área de Jornada permitirá:

- visão de quem está em jornada;
- quem está em pausa;
- quem deveria estar em jornada e não iniciou;
- jornadas extrapoladas;
- ajustes pendentes;
- cobertura por equipe/turno;
- histórico por usuário/equipe.

### 15.3 Despachante

No ranking de candidatos será possível distinguir:

- elegível;
- fora da jornada;
- em pausa;
- indisponível;
- ocupado;
- localização vencida;
- fora do escopo/região.

Candidatos inelegíveis não serão enviados ao OSRM por padrão.

## 16. APIs e serviços

Separar responsabilidades em módulos pequenos:

- `workShiftSessionService` — máquina de estados e persistência da sessão;
- `workShiftScheduleService` — planejamento/cálculo de escala;
- `workShiftAdjustmentService` — correções auditáveis;
- `dispatchEligibilityService` — filtro anterior ao GIS;
- `workShiftReportingService` — agregações e relatórios.

Procedures tRPC validam input/permissão/escopo e delegam a esses serviços.

## 17. Transações e concorrência

Operações de jornada são transacionais.

Requisitos:

- impedir duas sessões não encerradas para o mesmo usuário;
- proteger contra duplo clique/requisições concorrentes;
- inserir evento e atualizar sessão na mesma transação;
- sincronizar campos legados da equipe na mesma transação quando houver `teamId`;
- ajustes validam a versão/estado atual antes de materializar alterações;
- falha parcial não pode deixar sessão e evento divergentes.

Na D-007A, a estratégia concreta de lock será definida conforme as capacidades MySQL/Drizzle já usadas no projeto, priorizando restrição de unicidade aplicável e validação transacional.

## 18. Migração e rollback

A D-007A introduzirá novas tabelas por migration versionada.

Regras:

- não apagar campos atuais de `teams`;
- nenhuma migração destrutiva na primeira fase;
- rollback de aplicação deve continuar conseguindo ler o estado legado;
- dados históricos novos não serão descartados em rollback;
- uma rotina de reconciliação poderá identificar divergência entre sessão ativa e cache legado;
- execução real da migration em produção exige aprovação explícita posterior.

## 19. Fases de entrega

### D-007A — Fundação histórica

- tabelas `work_shift_sessions`, `work_shift_events` e `work_shift_adjustments`;
- máquina de estados por usuário;
- compatibilidade com `teams.updateShift`;
- RBAC inicial de jornada;
- consulta de histórico básico;
- testes de transição, atomicidade e concorrência;
- migration versionada, sem aplicação em produção.

### D-007B — Escalas e 12x36

- `work_shift_schedules`;
- `work_shift_assignments`;
- `work_shift_schedule_exceptions`;
- escalas fixas;
- 12x36 por ciclo/âncora/timezone;
- cálculo planejado x realizado;
- visão de cobertura.

### D-007C — Integração com despacho

- `dispatchEligibilityService`;
- filtro de jornada antes do GIS;
- motivos de inelegibilidade;
- UI no ranking;
- auditoria/telemetria de exclusões;
- testes garantindo que inelegíveis não chamem roteamento.

### D-007D — Administração, relatórios e alertas

- tela administrativa de jornadas;
- aprovação de ajustes;
- relatórios;
- exportações auditadas;
- alertas;
- indicadores de cobertura/SLA operacional.

## 20. Critérios de aceitação

A D-007 completa será considerada aceita quando:

- cada jornada realizada tiver histórico próprio;
- múltiplas jornadas do mesmo usuário forem preservadas;
- início/pausa/retorno/fim forem consistentes e auditáveis;
- ajustes preservarem antes/depois e decisão;
- escala 12x36 for calculada a partir de âncora e timezone;
- status operacional continuar separado da jornada;
- despacho filtrar candidatos fora da jornada antes do GIS;
- motivos de inelegibilidade forem explicáveis;
- relatórios respeitarem RBAC/escopo;
- desktop/mobile forem validados;
- segurança, TypeScript, Vitest, build e regressão GIS continuarem verdes;
- migrations permanecerem versionadas e não forem aplicadas em produção sem aprovação explícita.

## 21. Fora do escopo inicial

- folha de pagamento;
- cálculo jurídico completo de legislação trabalhista;
- integração com relógio de ponto homologado;
- biometria;
- reconhecimento facial;
- assinatura de ponto;
- banco de horas completo;
- integração automática com eSocial;
- alteração automática de jornada baseada apenas em GPS.

Esses itens podem ser avaliados como evoluções independentes.

## 22. Decisões consolidadas

- O domínio será baseado em **sessões + eventos auditáveis**, não event sourcing completo.
- A jornada será primariamente **individual por usuário**, com snapshot opcional do contexto de equipe.
- Os campos de jornada em `teams` serão preservados durante a transição.
- O status operacional continuará independente da jornada.
- O filtro de jornada ocorrerá antes do ranking GIS/OSRM.
- 12x36 será modelado por ciclo temporal com `cycleAnchorAt` e timezone.
- Sobreposição de escalas ativas para o mesmo usuário será bloqueada; exceções serão explícitas.
- Ajustes nunca apagarão silenciosamente a história original.
- Nenhuma migration será executada em produção sem aprovação posterior.
