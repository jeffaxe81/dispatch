ALTER TABLE `workflows` ADD `published_version` int NULL AFTER `current_version`;
--> statement-breakpoint
UPDATE `workflows`
SET `published_version` = `current_version`
WHERE `workflow_status` = 'publicado' AND `published_version` IS NULL;
