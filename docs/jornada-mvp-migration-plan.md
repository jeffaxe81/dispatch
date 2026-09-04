# Jornada MVP — Plano de Migração Drizzle

## Objetivo
Criar as estruturas persistentes do Controle de Jornada sem alterar manualmente o snapshot gerado pelo Drizzle Kit.

## Fonte de verdade
O schema funcional está em `drizzle/workShiftSchema.ts` e define:

- `work_shift_sessions`;
- `work_shift_events`;
- índices por usuário/estado e usuário/data;
- relacionamento com `users`;
- histórico de eventos por sessão;
- `actor_user_id` anulável em exclusão do ator;
- `session_id` com exclusão em cascata dos eventos da sessão.

## SQL esperado
A geração oficial deve resultar semanticamente em estruturas equivalentes às abaixo:

```sql
CREATE TABLE `work_shift_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `state` enum('fora_jornada','em_jornada','em_intervalo','encerrada') NOT NULL DEFAULT 'fora_jornada',
  `started_at` timestamp NULL,
  `break_started_at` timestamp NULL,
  `ended_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `work_shift_sessions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `work_shift_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `session_id` int NOT NULL,
  `user_id` int NOT NULL,
  `event_type` enum('iniciar','iniciar_intervalo','retomar','encerrar','ajuste') NOT NULL,
  `previous_state` enum('fora_jornada','em_jornada','em_intervalo','encerrada'),
  `next_state` enum('fora_jornada','em_jornada','em_intervalo','encerrada') NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `actor_user_id` int,
  `metadata` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `work_shift_events_id` PRIMARY KEY(`id`)
);

ALTER TABLE `work_shift_sessions`
  ADD CONSTRAINT `work_shift_sessions_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`);

ALTER TABLE `work_shift_events`
  ADD CONSTRAINT `work_shift_events_session_id_work_shift_sessions_id_fk`
  FOREIGN KEY (`session_id`) REFERENCES `work_shift_sessions`(`id`) ON DELETE CASCADE;

ALTER TABLE `work_shift_events`
  ADD CONSTRAINT `work_shift_events_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`);

ALTER TABLE `work_shift_events`
  ADD CONSTRAINT `work_shift_events_actor_user_id_users_id_fk`
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

CREATE INDEX `work_shift_sessions_user_state_idx`
  ON `work_shift_sessions` (`user_id`,`state`);
CREATE INDEX `work_shift_sessions_user_started_idx`
  ON `work_shift_sessions` (`user_id`,`started_at`);
CREATE INDEX `work_shift_events_session_occurred_idx`
  ON `work_shift_events` (`session_id`,`occurred_at`);
CREATE INDEX `work_shift_events_user_occurred_idx`
  ON `work_shift_events` (`user_id`,`occurred_at`);
```

## Procedimento obrigatório antes de merge

1. Executar o comando oficial de geração Drizzle definido no `package.json`/toolchain do repositório.
2. Confirmar que o Drizzle gerou simultaneamente SQL, snapshot e atualização do journal.
3. Comparar semanticamente o SQL gerado com este documento e com `drizzle/workShiftSchema.ts`.
4. Aplicar a migração em banco descartável/homologação vazio.
5. Aplicar a migração em banco de homologação com usuários existentes.
6. Validar rollback por restauração do checkpoint/banco de teste; não executar rollback destrutivo em produção.
7. Executar testes de domínio, persistência, gateway, runtime e API da Jornada.
8. Somente após evidência verde considerar a migração homologada.

## Regra de segurança
Não editar manualmente `drizzle/meta/_journal.json` nem criar snapshot fictício. Esses artefatos devem ser produzidos pelo Drizzle Kit para evitar divergência em futuras migrações.
