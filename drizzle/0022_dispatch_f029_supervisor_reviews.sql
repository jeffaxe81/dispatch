-- AXED-F029: decisões imutáveis de supervisão vinculadas à revisão exata.
-- Executar somente em ambiente autorizado, com backup e homologação da migração.
CREATE TABLE `form_submission_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenant_id` int NOT NULL,
  `submission_id` int NOT NULL,
  `revision` int NOT NULL,
  `decision` enum('approved','returned') NOT NULL,
  `reason` text NOT NULL,
  `reviewer_user_id` int NOT NULL,
  `reviewed_at` timestamp NOT NULL,
  CONSTRAINT `form_submission_reviews_id` PRIMARY KEY(`id`),
  CONSTRAINT `form_submission_reviews_revision_unique` UNIQUE(`submission_id`,`revision`)
);
--> statement-breakpoint
ALTER TABLE `form_submission_reviews` ADD CONSTRAINT `form_submission_reviews_tenant_id_organizations_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submission_reviews` ADD CONSTRAINT `form_submission_reviews_submission_id_form_submissions_id_fk` FOREIGN KEY (`submission_id`) REFERENCES `form_submissions`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `form_submission_reviews` ADD CONSTRAINT `form_submission_reviews_reviewer_user_id_users_id_fk` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `form_submission_reviews_tenant_submission_idx` ON `form_submission_reviews` (`tenant_id`,`submission_id`);
