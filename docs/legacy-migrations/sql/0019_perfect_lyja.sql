ALTER TABLE `user_role_assignments` ADD `active_user_id` int;--> statement-breakpoint
UPDATE `user_role_assignments` SET `active_user_id` = `user_id` WHERE `active` = true;--> statement-breakpoint
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_roles_active_user_unique` UNIQUE(`active_user_id`);
