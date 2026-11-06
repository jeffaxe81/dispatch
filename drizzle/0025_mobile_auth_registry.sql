-- AXE Despacho mobile-native authentication: PRE-PRODUCTION schema only.
-- These tables are dormant. No native login endpoints, operational tokens,
-- device enrolment endpoints or GPS write paths are enabled by this migration.
-- Apply only through an approved, backed-up migration deployment.
-- All credential, device and handle identifiers are SHA-256 hashes.
CREATE TABLE `mobile_registered_devices` (
  `device_hash` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `team_id` int NOT NULL,
  `registered_at_ms` bigint NOT NULL,
  `revoked_at_ms` bigint NULL,
  CONSTRAINT `mobile_registered_devices_device_hash` PRIMARY KEY (`device_hash`)
);
--> statement-breakpoint
CREATE INDEX `mobile_registered_devices_user_scope_idx` ON `mobile_registered_devices` (`user_id`, `organization_id`, `team_id`);
--> statement-breakpoint
CREATE TABLE `mobile_authorization_codes` (
  `code_hash` varchar(64) NOT NULL,
  `client_id` varchar(100) NOT NULL,
  `redirect_uri` varchar(512) NOT NULL,
  `code_challenge` varchar(43) NOT NULL,
  `user_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `team_id` int NOT NULL,
  `device_hash` varchar(64) NOT NULL,
  `issued_at_ms` bigint NOT NULL,
  `expires_at_ms` bigint NOT NULL,
  `consumed_at_ms` bigint NULL,
  `revoked_at_ms` bigint NULL,
  CONSTRAINT `mobile_authorization_codes_code_hash` PRIMARY KEY (`code_hash`)
);
--> statement-breakpoint
CREATE INDEX `mobile_auth_codes_device_idx` ON `mobile_authorization_codes` (`device_hash`);
--> statement-breakpoint
CREATE INDEX `mobile_auth_codes_expiry_idx` ON `mobile_authorization_codes` (`expires_at_ms`);
--> statement-breakpoint
CREATE TABLE `mobile_sessions` (
  `session_hash` varchar(64) NOT NULL,
  `device_hash` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `organization_id` int NOT NULL,
  `team_id` int NOT NULL,
  `issued_at_ms` bigint NOT NULL,
  `expires_at_ms` bigint NOT NULL,
  `revoked_at_ms` bigint NULL,
  CONSTRAINT `mobile_sessions_session_hash` PRIMARY KEY (`session_hash`)
);
--> statement-breakpoint
CREATE INDEX `mobile_sessions_device_revoked_idx` ON `mobile_sessions` (`device_hash`, `revoked_at_ms`);
--> statement-breakpoint
CREATE INDEX `mobile_sessions_expiry_idx` ON `mobile_sessions` (`expires_at_ms`);
--> statement-breakpoint
CREATE INDEX `mobile_sessions_user_org_idx` ON `mobile_sessions` (`user_id`, `organization_id`);
