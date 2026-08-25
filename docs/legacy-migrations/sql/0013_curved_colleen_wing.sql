ALTER TABLE `user_profiles` ADD `avatar_storage_key` varchar(512);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `avatar_content_type` varchar(120);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `avatar_updated_at` timestamp;