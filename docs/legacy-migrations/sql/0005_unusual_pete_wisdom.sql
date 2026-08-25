CREATE TABLE `general_settings` (
	`id` int NOT NULL,
	`map_center_latitude` decimal(10,7) NOT NULL DEFAULT '-27.0976000',
	`map_center_longitude` decimal(10,7) NOT NULL DEFAULT '-48.9104000',
	`map_default_zoom` int NOT NULL DEFAULT 13,
	`map_type` varchar(20) NOT NULL DEFAULT 'roadmap',
	`map_traffic_enabled` boolean NOT NULL DEFAULT false,
	`map_auto_fit_enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `general_settings_id` PRIMARY KEY(`id`)
);
