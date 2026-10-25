-- =====================================================================
--  RentEase schema (MySQL 8 / Aiven). Mirrors the migrations in app/migrations.
--  Preferred way: run  php lava migration run  (this file is the manual alternative).
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `bills` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `lease_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `period_month` char(7) NOT NULL,
  `description` varchar(150) NOT NULL DEFAULT '',
  `amount` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('unpaid','paid','overdue') NOT NULL DEFAULT 'unpaid',
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `one_bill_per_lease_month` (`lease_id`,`period_month`),
  KEY `tenant_idx` (`tenant_id`),
  KEY `status_due_idx` (`status`,`due_date`),
  CONSTRAINT `fk_bills_lease` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`id`),
  CONSTRAINT `fk_bills_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `leases` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `unit_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `monthly_rent` decimal(10,2) NOT NULL,
  `deposit` decimal(10,2) NOT NULL DEFAULT 0.00,
  `due_day` tinyint(3) unsigned NOT NULL DEFAULT 5,
  `status` enum('active','ended') NOT NULL DEFAULT 'active',
  `active_unit_id` int(10) unsigned GENERATED ALWAYS AS (if(`status` = 'active',`unit_id`,NULL)) STORED,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `one_active_lease_per_unit` (`active_unit_id`),
  KEY `tenant_idx` (`tenant_id`),
  KEY `status_idx` (`status`),
  KEY `fk_leases_unit` (`unit_id`),
  CONSTRAINT `fk_leases_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_leases_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `lease_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `lease_id` int(10) unsigned NOT NULL,
  `actor_id` int(10) unsigned DEFAULT NULL,
  `event_type` varchar(40) NOT NULL,
  `summary` varchar(255) NOT NULL,
  `before_data` text DEFAULT NULL,
  `after_data` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `lease_events_history` (`lease_id`,`created_at`,`id`),
  CONSTRAINT `fk_lease_events_lease` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lease_events_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `lease_documents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `lease_id` int(10) unsigned NOT NULL,
  `uploaded_by` int(10) unsigned DEFAULT NULL,
  `original_name` varchar(180) NOT NULL,
  `mime` varchar(40) NOT NULL,
  `data` longblob NOT NULL,
  `byte_size` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `lease_documents_lease` (`lease_id`,`created_at`,`id`),
  CONSTRAINT `fk_lease_documents_lease` FOREIGN KEY (`lease_id`) REFERENCES `leases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lease_documents_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `maintenance_requests` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `unit_id` int(10) unsigned NOT NULL,
  `title` varchar(120) NOT NULL,
  `description` text NOT NULL,
  `priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `status` enum('pending','in_progress','resolved') NOT NULL DEFAULT 'pending',
  `admin_notes` text DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tenant_idx` (`tenant_id`),
  KEY `status_idx` (`status`),
  KEY `fk_maint_unit` (`unit_id`),
  CONSTRAINT `fk_maint_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_maint_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `notifications_log` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned DEFAULT NULL,
  `type` enum('welcome','due_reminder','payment_confirmation','maintenance_update','other') NOT NULL DEFAULT 'other',
  `related_id` int(10) unsigned DEFAULT NULL,
  `channel` enum('email') NOT NULL DEFAULT 'email',
  `recipient` varchar(255) NOT NULL,
  `subject` varchar(200) NOT NULL,
  `status` enum('sent','failed','skipped') NOT NULL,
  `error` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_idx` (`user_id`),
  KEY `type_related_idx` (`type`,`related_id`,`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `payments` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `bill_id` int(10) unsigned NOT NULL,
  `tenant_id` int(10) unsigned NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` enum('paymongo','cash','bank_transfer') NOT NULL DEFAULT 'paymongo',
  `status` enum('pending','paid','failed') NOT NULL DEFAULT 'pending',
  `receipt_no` varchar(30) DEFAULT NULL,
  `paymongo_checkout_id` varchar(100) DEFAULT NULL,
  `paymongo_payment_ref` varchar(100) DEFAULT NULL,
  `recorded_by` int(10) unsigned DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipt_unique` (`receipt_no`),
  UNIQUE KEY `checkout_unique` (`paymongo_checkout_id`),
  KEY `bill_idx` (`bill_id`),
  KEY `tenant_idx` (`tenant_id`),
  KEY `status_idx` (`status`),
  KEY `fk_payments_recorder` (`recorded_by`),
  CONSTRAINT `fk_payments_bill` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`),
  CONSTRAINT `fk_payments_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `properties` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `owner_id` int(10) unsigned NOT NULL,
  `name` varchar(120) NOT NULL,
  `type` enum('apartment','boarding_house') NOT NULL DEFAULT 'apartment',
  `address` varchar(255) NOT NULL,
  `city` varchar(100) NOT NULL DEFAULT '',
  `barangay` varchar(100) NOT NULL DEFAULT '',
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `owner_idx` (`owner_id`),
  CONSTRAINT `fk_properties_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `token` text NOT NULL,
  `expires_at` datetime NOT NULL,
  `jti` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(64) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `setting_group` enum('branding','colors','hero','appearance') NOT NULL DEFAULT 'branding',
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_settings_key` (`setting_key`),
  KEY `idx_site_settings_group` (`setting_group`),
  KEY `fk_site_settings_user` (`updated_by`),
  CONSTRAINT `fk_site_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `site_settings_log` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(64) NOT NULL,
  `old_value` text DEFAULT NULL,
  `new_value` text DEFAULT NULL,
  `changed_by` int(10) unsigned DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_settings_log_key` (`setting_key`),
  KEY `idx_settings_log_time` (`changed_at`),
  KEY `fk_settings_log_user` (`changed_by`),
  CONSTRAINT `fk_settings_log_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `units` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `property_id` int(10) unsigned NOT NULL,
  `unit_name` varchar(50) NOT NULL,
  `monthly_rent` decimal(10,2) NOT NULL DEFAULT 0.00,
  `capacity` smallint(5) unsigned NOT NULL DEFAULT 1,
  `occupancy_status` enum('vacant','occupied') NOT NULL DEFAULT 'vacant',
  `condition_tag` enum('good_condition','under_maintenance') NOT NULL DEFAULT 'good_condition',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unit_per_property` (`property_id`,`unit_name`),
  CONSTRAINT `fk_units_property` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(120) NOT NULL DEFAULT '',
  `phone` varchar(30) DEFAULT NULL,
  `role` enum('admin','tenant','superadmin') NOT NULL DEFAULT 'tenant',
  `landlord_id` int(10) unsigned DEFAULT NULL,
  `onboarding_completed` tinyint(1) unsigned NOT NULL DEFAULT 1,
  `google_id` varchar(64) DEFAULT NULL,
  `is_active` tinyint(1) unsigned NOT NULL DEFAULT 1,
  `must_change_password` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username_unique` (`username`),
  UNIQUE KEY `email_unique` (`email`),
  UNIQUE KEY `google_id_unique` (`google_id`),
  KEY `role_idx` (`role`),
  KEY `user_landlord_idx` (`landlord_id`),
  CONSTRAINT `fk_user_landlord` FOREIGN KEY (`landlord_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_token_hash` (`token_hash`),
  KEY `password_reset_user_created` (`user_id`,`created_at`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `site_assets` (
  `asset_key` varchar(32) NOT NULL,
  `mime` varchar(40) NOT NULL,
  `data` mediumblob NOT NULL,
  `byte_size` int(10) unsigned NOT NULL,
  `updated_by` int(10) unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`asset_key`),
  KEY `fk_site_assets_user` (`updated_by`),
  CONSTRAINT `fk_site_assets_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `unit_transfer_requests` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `current_unit_id` int(10) unsigned NOT NULL,
  `requested_unit_id` int(10) unsigned NOT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `admin_note` text DEFAULT NULL,
  `decided_by` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `decided_at` datetime DEFAULT NULL,
  `pending_tenant_id` int(10) unsigned GENERATED ALWAYS AS (if(`status` = 'pending',`tenant_id`,NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `one_pending_transfer_per_tenant` (`pending_tenant_id`),
  KEY `transfer_status_idx` (`status`,`created_at`),
  KEY `transfer_tenant_idx` (`tenant_id`),
  CONSTRAINT `fk_transfer_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transfer_current_unit` FOREIGN KEY (`current_unit_id`) REFERENCES `units` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_transfer_requested_unit` FOREIGN KEY (`requested_unit_id`) REFERENCES `units` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_transfer_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `in_app_notifications` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `type` varchar(40) NOT NULL,
  `title` varchar(180) NOT NULL,
  `message` varchar(500) NOT NULL,
  `related_id` int(10) unsigned DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_created_idx` (`user_id`,`created_at`),
  KEY `user_unread_idx` (`user_id`,`is_read`,`created_at`),
  CONSTRAINT `fk_in_app_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `assistant_conversations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `title` varchar(120) NOT NULL DEFAULT 'New conversation',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `assistant_conversation_user_updated` (`user_id`,`updated_at`,`id`),
  CONSTRAINT `fk_assistant_conversation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `assistant_messages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int(10) unsigned NOT NULL,
  `role` enum('user','assistant') NOT NULL,
  `content` mediumtext NOT NULL,
  `proposal_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `assistant_message_conversation` (`conversation_id`,`id`),
  CONSTRAINT `fk_assistant_message_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
