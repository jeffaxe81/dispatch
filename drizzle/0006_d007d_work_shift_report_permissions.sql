INSERT INTO `access_permissions` (`code`, `resource`, `action`, `description`, `active`)
VALUES
  ('work_shift_reports.view', 'work_shift_reports', 'view', 'Visualiza relatórios de jornada dentro do escopo autorizado.', true),
  ('work_shift_reports.export', 'work_shift_reports', 'export', 'Exporta relatórios de jornada dentro do escopo autorizado.', true)
ON DUPLICATE KEY UPDATE
  `resource` = VALUES(`resource`),
  `action` = VALUES(`action`),
  `description` = VALUES(`description`),
  `active` = VALUES(`active`);