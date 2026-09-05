# D-007A — Evidência da Fundação Histórica do Controle de Jornada

## Escopo entregue

A D-007A introduz a fundação histórica e auditável da jornada individual sem antecipar as fases D-007B, D-007C e D-007D.

Entregas principais:

- domínio tipado de jornada com ações `start`, `pause`, `resume` e `end`;
- persistência histórica por sessão e eventos;
- cálculo acumulado de pausas e tempo trabalhado;
- API tRPC de autoatendimento `workShifts.current`, `workShifts.history` e `workShifts.control`;
- RBAC específico `work_shifts.view` e `work_shifts.control`;
- compatibilidade com o controle legado `teams.*shift*` e `teams.updateShift`;
- inventário tRPC atualizado para a superfície atual do branch.

## Tabelas históricas

### `work_shift_sessions`

Registra a sessão individual de jornada, incluindo usuário, equipe opcional, início, pausa, encerramento, estado e métricas de duração.

### `work_shift_events`

Registra a trilha de eventos da sessão com tipo, instante, ator e snapshots serializáveis antes/depois.

A FK `work_shift_events.session_id -> work_shift_sessions.id` usa `ON DELETE RESTRICT`, preservando a trilha histórica e impedindo remoção por cascade.

## Concorrência e consistência

O fluxo de escrita serializa por usuário dentro da transação antes de decidir a ação de jornada. A implementação bloqueia o registro do usuário com `FOR UPDATE`, consulta a sessão aberta somente depois do lock e persiste sessão, evento e eventual espelho legado dentro da mesma transação.

Objetivo da regra: impedir duas sessões abertas para o mesmo usuário em chamadas concorrentes.

## Eventos append-only

Cada transição válida grava exatamente um evento correspondente. O fluxo normal não atualiza nem apaga eventos históricos. Os snapshots são normalizados para representação serializável, incluindo datas em ISO quando aplicável.

## Compatibilidade legada

Os campos legados de equipe permanecem disponíveis:

- `teams.shiftStartedAt`;
- `teams.shiftEndsAt`;
- `teams.shiftPausedAt`;
- `teams.shiftPausedTotalSeconds`.

O espelho ocorre somente quando a sessão individual possui `teamId`. As transições da nova jornada não alteram automaticamente `teams.status`. O endpoint legado `teams.updateShift` permanece preservado nesta fase.

## RBAC

Foram catalogadas somente as permissões:

- `work_shifts.view`;
- `work_shifts.control`.

Não foram adicionados grants automáticos em `role_permissions`. O comportamento legado do administrador com wildcard `*` permanece compatível.

## Migration revisada

Arquivo: `drizzle/0003_d007a_work_shift_history.sql`.

Revisão destrutiva realizada sobre o conteúdo do PR:

- cria somente `work_shift_sessions` e `work_shift_events`;
- cria índices e FKs relacionadas à D-007A;
- adiciona ao catálogo somente `work_shifts.view` e `work_shifts.control`;
- não contém `DROP TABLE`;
- não contém `DROP COLUMN`;
- não altera destrutivamente tabelas operacionais existentes;
- não insere grants em `role_permissions`;
- não contém dados operacionais reais;
- `work_shift_events.session_id` usa `ON DELETE RESTRICT`.

A migration foi somente gerada e revisada. Não foi aplicada em banco real.

## Cobertura tRPC

O inventário gerado contém a raiz `workShifts` e os contratos:

- `workShifts.current`;
- `workShifts.history`;
- `workShifts.control`.

A superfície atual do branch é de **104 procedimentos tRPC**. O plano original previa 97 + 3 = 100, porém o branch incorporou outras mudanças intencionais concorrentes; por isso foi mantida a contagem real observada, sem mascarar a divergência.

## Gates anteriores ao commit documental

SHA validado: `3574e8356a92c0093df730342ab708341a6703f2`.

No mesmo SHA:

- Qualidade — run #166 / id `33911539869` — **success**;
- GIS visual homologation — run #161 / id `33911539835` — **success**;
- NEO workspace visual homologation — run #141 / id `33911539831` — **success**;
- NEO external compatibility — run #98 / id `33911539829` — **success**.

O workflow Qualidade concluiu com sucesso as etapas de segurança, TypeScript, testes e build.

Como este documento cria um novo SHA, os quatro gates devem ser reexecutados e aprovados no novo SHA antes da criação do checkpoint imutável.

## Escopo explicitamente adiado

### D-007B

Escalas fixas/cíclicas, 12x36, associações, exceções, timezone e planejamento.

### D-007C

Elegibilidade por jornada antes do ranking GIS/despacho, incluindo motivos `outside_shift` e `shift_paused`.

### D-007D

Ajustes, aprovação/rejeição, administração, relatórios, exportações e alertas.

## Restrições preservadas

- PR permanece Draft;
- sem merge em `main`;
- sem deploy;
- sem aplicação de migration em banco real;
- sem grants automáticos;
- D-007B/C/D fora deste PR.
