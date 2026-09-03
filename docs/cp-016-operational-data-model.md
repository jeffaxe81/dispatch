# CP-016 — Modelo de Dados Operacional

## Objetivo

Consolidar a evolução de jornada, elegibilidade para despacho, localização/trajeto e integrações externas sem duplicar estruturas já existentes no AXE Dispatch v1.15.0.

## Premissas preservadas

- `teams` continua sendo a unidade operacional de despacho.
- Os campos atuais de jornada em `teams` permanecem como snapshot rápido do estado corrente.
- `team_locations` permanece como fonte de telemetria e histórico de posição.
- `audit_logs` permanece como trilha transversal de auditoria.
- `integration_connections` continua sendo o cadastro genérico de integrações; a integração NEO deve reutilizar essa camada quando aplicável.
- Datas são persistidas em UTC.
- A evolução deve continuar compatível com MySQL/Drizzle e evitar decisões que dificultem uma futura migração para PostgreSQL.

## Novas entidades

### `shift_templates`
Define modelos reutilizáveis de escala, inclusive 12x36.

Campos propostos:
- `id`
- `organization_id`
- `code`
- `name`
- `kind`: `fixed`, `12x36`, `custom`
- `work_minutes`
- `rest_minutes`
- `timezone`
- `active`
- `created_at`
- `updated_at`

### `shift_schedules`
Vincula pessoa/equipe a uma escala prevista.

Campos propostos:
- `id`
- `shift_template_id`
- `user_id`
- `team_id`
- `scheduled_start_at`
- `scheduled_end_at`
- `status`: `scheduled`, `active`, `completed`, `cancelled`
- `created_by_user_id`
- `created_at`
- `updated_at`

Regra: ao menos `user_id` ou `team_id` deve estar preenchido.

### `work_sessions`
Representa a jornada efetivamente executada e auditável.

Campos propostos:
- `id`
- `shift_schedule_id`
- `user_id`
- `team_id`
- `started_at`
- `ended_at`
- `total_pause_seconds`
- `status`: `open`, `paused`, `closed`, `adjusted`
- `source`: `manual`, `schedule`, `integration`, `admin_adjustment`
- `created_at`
- `updated_at`

### `work_session_events`
Trilha detalhada de início, pausa, retorno, encerramento e ajuste.

Campos propostos:
- `id`
- `work_session_id`
- `event_type`: `start`, `pause`, `resume`, `end`, `adjustment`
- `occurred_at`
- `actor_user_id`
- `reason`
- `metadata`
- `created_at`

Ajustes administrativos nunca sobrescrevem silenciosamente o histórico; geram evento e auditoria.

### `operational_presence`
Snapshot do estado operacional usado pelo motor de despacho.

Campos propostos:
- `id`
- `user_id`
- `team_id`
- `work_session_id`
- `status`: `available`, `busy`, `paused`, `offline`, `out_of_shift`
- `available_for_dispatch`
- `region_code`
- `skills`
- `last_changed_at`
- `updated_at`

Objetivo: impedir que o motor tenha de reconstruir toda a jornada a cada consulta de candidatos.

### `route_tracks`
Agrupa uma trilha de deslocamento sem substituir `team_locations`.

Campos propostos:
- `id`
- `team_id`
- `user_id`
- `incident_id`
- `assignment_id`
- `started_at`
- `ended_at`
- `distance_meters`
- `duration_seconds`
- `status`: `active`, `completed`, `cancelled`
- `created_at`
- `updated_at`

### `route_track_points`
Permite vincular telemetria a uma trilha específica quando necessário.

Campos propostos:
- `id`
- `route_track_id`
- `team_location_id`
- `sequence`
- `created_at`

O ponto geográfico continua em `team_locations`; a tabela apenas cria vínculo/ordenação para evitar duplicação de coordenadas.

### `embedded_integrations`
Configuração de aplicações externas exibidas dentro do Dispatch.

Campos propostos:
- `id`
- `integration_connection_id`
- `code`
- `name`
- `url`
- `display_mode`: `iframe`, `external`
- `allow_fullscreen`
- `enabled`
- `allowed_roles`
- `created_at`
- `updated_at`

Primeiro uso previsto: NEO Interact em `https://gscprj.saas.digitro.cloud/neo/`.

Credenciais ou tokens não devem ser gravados nessa tabela; devem permanecer na camada segura de credenciais de integração.

## Estado corrente x histórico

`teams.shiftStartedAt`, `shiftEndsAt`, `shiftPausedAt` e `shiftPausedTotalSeconds` continuam funcionando como estado corrente/compatibilidade. A fonte histórica definitiva passa a ser `work_sessions` + `work_session_events`.

Durante a migração:
1. nenhum campo atual é removido;
2. novas transições escrevem no novo histórico e atualizam o snapshot em `teams`;
3. somente após homologação uma release futura poderá avaliar descontinuação dos campos legados.

## Elegibilidade para despacho

A ordem inicial será:

1. organização/escopo compatível;
2. jornada válida e aberta;
3. `available_for_dispatch = true`;
4. status operacional disponível;
5. perfil/habilidade compatível;
6. região compatível;
7. posição recente válida;
8. proximidade/ETA;
9. carga atual da equipe;
10. prioridade e regras da ocorrência.

Uma equipe fora da jornada ou pausada é inelegível mesmo que seja a mais próxima.

## Índices mínimos

- `shift_schedules(user_id, scheduled_start_at)`
- `shift_schedules(team_id, scheduled_start_at)`
- `work_sessions(user_id, status, started_at)`
- `work_sessions(team_id, status, started_at)`
- `work_session_events(work_session_id, occurred_at)`
- `operational_presence(team_id, available_for_dispatch, status)`
- `route_tracks(team_id, status, started_at)`
- `route_tracks(incident_id, assignment_id)`
- `route_track_points(route_track_id, sequence)` único
- `embedded_integrations(code)` único

## Auditoria obrigatória

Gerar `audit_logs` para:
- criação/alteração/cancelamento de escala;
- ajuste manual de jornada;
- alteração administrativa de disponibilidade;
- habilitação/desabilitação de integração embutida;
- mudança da URL de integração;
- encerramento ou cancelamento manual de trilha.

## Privacidade e retenção

- Localização deve seguir princípio de minimização e acesso por perfil/escopo.
- Não coletar localização fora da finalidade operacional autorizada.
- Políticas de retenção de `team_locations`, `route_tracks` e `route_track_points` serão parametrizáveis em etapa própria.
- Toda exportação de trilha deve ser auditável.

## Compatibilidade e rollback

Esta etapa é aditiva. O rollback de aplicação pode ocorrer sem remover as novas tabelas; migrations destrutivas ficam proibidas no CP-016. A reversão de banco deve, portanto, consistir em parar de consumir as novas estruturas, mantendo dados históricos preservados.

## Critério de aceite do modelo

- sem perda das jornadas atuais;
- suporte explícito a 12x36;
- histórico auditável de jornada;
- filtro de agentes fora da jornada no motor de despacho;
- reaproveitamento de `team_locations`;
- trilhas sem duplicação de coordenadas;
- configuração segura do iframe do NEO;
- arquitetura pronta para regras de retenção e multi-tenant.