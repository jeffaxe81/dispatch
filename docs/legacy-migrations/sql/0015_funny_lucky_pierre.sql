CREATE TABLE `faq_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`question` varchar(280) NOT NULL,
	`detail` text,
	`faq_suggestion_status` enum('pendente','avaliada','publicada','recusada') NOT NULL DEFAULT 'pendente',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faq_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `help_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`help_favorite_type` enum('manual','faq') NOT NULL,
	`content_id` varchar(80) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `help_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `help_favorites_user_content_unique` UNIQUE(`user_id`,`help_favorite_type`,`content_id`)
);
--> statement-breakpoint
ALTER TABLE `faq_suggestions` ADD CONSTRAINT `faq_suggestions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `help_favorites` ADD CONSTRAINT `help_favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `faq_suggestions_user_created_idx` ON `faq_suggestions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `faq_suggestions_status_created_idx` ON `faq_suggestions` (`faq_suggestion_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `help_favorites_user_created_idx` ON `help_favorites` (`user_id`,`created_at`);