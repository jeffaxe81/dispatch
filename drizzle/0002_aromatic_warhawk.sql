ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_attempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `users_login_lock_idx` ON `users` (`locked_until`);