<?php

/**
 * Persist billing terms on leases and allow tenants to request an early move-in.
 */
class Lease_billing_and_early_move_requests
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    private function has_column($table, $column)
    {
        return (int) $this->_lava->db->raw(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column]
        )->fetchColumn() > 0;
    }

    public function up()
    {
        $db = $this->_lava->db;
        if (!$this->has_column('leases', 'billing_style')) {
            $db->raw("ALTER TABLE leases ADD COLUMN billing_style ENUM('calendar','anniversary','first_of_month') NOT NULL DEFAULT 'calendar' AFTER due_day");
        }
        if (!$this->has_column('leases', 'prorate_first_month')) {
            $db->raw('ALTER TABLE leases ADD COLUMN prorate_first_month TINYINT(1) NOT NULL DEFAULT 0 AFTER billing_style');
        }
        if (!$this->has_column('leases', 'grace_period_days')) {
            $db->raw('ALTER TABLE leases ADD COLUMN grace_period_days TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER prorate_first_month');
        }
        if (!$this->has_column('leases', 'late_fee')) {
            $db->raw('ALTER TABLE leases ADD COLUMN late_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER grace_period_days');
        }
        if (!$this->has_column('bills', 'late_fee_amount')) {
            $db->raw('ALTER TABLE bills ADD COLUMN late_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount');
        }

        $groupType = $db->raw(
            "SELECT COLUMN_TYPE FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND COLUMN_NAME = 'setting_group'"
        )->fetchColumn();
        if ($groupType && strpos($groupType, "'billing'") === false) {
            $db->raw("ALTER TABLE site_settings MODIFY setting_group ENUM('branding','colors','hero','appearance','billing') NOT NULL DEFAULT 'branding'");
        }

        $db->raw(<<<'SQL'
CREATE TABLE IF NOT EXISTS early_move_in_requests (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lease_id           INT UNSIGNED NOT NULL,
  tenant_id          INT UNSIGNED NOT NULL,
  requested_start_date DATE NOT NULL,
  reason             TEXT NOT NULL,
  tenant_acknowledged_at DATETIME NOT NULL,
  status             ENUM('pending','approved','rejected','cancelled','expired') NOT NULL DEFAULT 'pending',
  admin_note         TEXT NULL,
  decided_by         INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at         DATETIME NULL,
  pending_tenant_id  INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'pending', tenant_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY one_pending_early_move_per_tenant (pending_tenant_id),
  KEY early_move_landlord_queue (status, created_at),
  KEY early_move_lease (lease_id, created_at),
  CONSTRAINT fk_early_move_lease FOREIGN KEY (lease_id) REFERENCES leases (id) ON DELETE CASCADE,
  CONSTRAINT fk_early_move_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_early_move_decider FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw('DROP TABLE IF EXISTS early_move_in_requests');
        $db->raw('ALTER TABLE bills DROP COLUMN late_fee_amount');
        $db->raw('ALTER TABLE leases DROP COLUMN late_fee, DROP COLUMN grace_period_days, DROP COLUMN prorate_first_month, DROP COLUMN billing_style');
        $db->raw("UPDATE site_settings SET setting_group = 'appearance' WHERE setting_group = 'billing'");
        $db->raw("ALTER TABLE site_settings MODIFY setting_group ENUM('branding','colors','hero','appearance') NOT NULL DEFAULT 'branding'");
    }
}
