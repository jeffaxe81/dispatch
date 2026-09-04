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
--> statement-breakpoint
CREATE TABLE `work_shift_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`state` enum('fora_jornada','em_jornada','em_intervalo','encerrada') NOT NULL DEFAULT 'fora_jornada',
	`started_at` timestamp,
	`break_started_at` timestamp,
	`ended_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_shift_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `work_shift_events` ADD CONSTRAINT `work_shift_events_session_id_work_shift_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `work_shift_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_events` ADD CONSTRAINT `work_shift_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_events` ADD CONSTRAINT `work_shift_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `work_shift_sessions` ADD CONSTRAINT `work_shift_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_shift_events_session_occurred_idx` ON `work_shift_events` (`session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `work_shift_events_user_occurred_idx` ON `work_shift_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_user_state_idx` ON `work_shift_sessions` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `work_shift_sessions_user_started_idx` ON `work_shift_sessions` (`user_id`,`started_at`);