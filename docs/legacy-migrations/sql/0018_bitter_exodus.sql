ALTER TABLE `teams` ADD `shift_paused_at` timestamp;--> statement-breakpoint
ALTER TABLE `teams` ADD `shift_paused_total_seconds` int DEFAULT 0 NOT NULL;