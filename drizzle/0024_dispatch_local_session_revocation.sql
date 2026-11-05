-- AXE Despacho: durable JWT revocations (pre-production only).
-- Apply ONLY after backup, isolated MySQL test and explicit approval.
-- The application fails closed for valid sessions if this table is unavailable.
CREATE TABLE `local_revoked_sessions` (
  `token_hash` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `local_revoked_sessions_token_hash_pk` PRIMARY KEY (`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `local_revoked_sessions_user_idx` ON `local_revoked_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `local_revoked_sessions_expires_idx` ON `local_revoked_sessions` (`expires_at`);
