-- P0: persistent revocation registry for short-lived local JWT sessions.
-- Apply ONLY after backup, homologation and authorized migration deployment.
-- No JWTs, passwords or plaintext jti values are stored.
CREATE TABLE `local_auth_sessions` (
  `session_hash` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `local_auth_sessions_session_hash` PRIMARY KEY (`session_hash`)
);
--> statement-breakpoint
ALTER TABLE `local_auth_sessions` ADD CONSTRAINT `local_auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `local_auth_sessions_user_idx` ON `local_auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `local_auth_sessions_expiry_idx` ON `local_auth_sessions` (`expires_at`);
