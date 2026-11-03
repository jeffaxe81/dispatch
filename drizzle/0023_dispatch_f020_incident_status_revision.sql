-- AXED-F020: revisão monotônica das mudanças de status.
-- Migração aditiva sujeita à homologação e backup do ambiente.
ALTER TABLE `incidents` ADD COLUMN `status_revision` int NOT NULL DEFAULT 1;
