<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Add landlord contract defaults and safe future-dated lease offers. */
class Lease_offers_and_unit_defaults
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    private function has_column($table, $column)
    {
        return (bool) $this->_lava->db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
            [$table, $column]
        )->fetchColumn();
    }

    public function up()
    {
        $db = $this->_lava->db;

        if (!$this->has_column('leases', 'contract_required')) {
            $duplicate = $db->raw(
                "SELECT tenant_id FROM leases WHERE status IN ('offered','active')
                  GROUP BY tenant_id HAVING COUNT(*) > 1 LIMIT 1"
            )->fetchColumn();
            if ($duplicate) {
                throw new RuntimeException(
                    'Migration 030 cannot enforce one current lease or offer per tenant while tenant ID '
                    . (int) $duplicate . ' has multiple active leases. Resolve the duplicate lease records, then retry.'
                );
            }
        }

        if (!$this->has_column('properties', 'contract_template')) {
            $db->raw('ALTER TABLE properties ADD COLUMN contract_template JSON NULL');
        }
        if (!$this->has_column('units', 'default_deposit')) {
            $db->raw('ALTER TABLE units ADD COLUMN default_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER monthly_rent');
        }
        if (!$this->has_column('units', 'default_due_day')) {
            $db->raw('ALTER TABLE units ADD COLUMN default_due_day TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER default_deposit');
        }
        if (!$this->has_column('units', 'contract_template')) {
            $db->raw('ALTER TABLE units ADD COLUMN contract_template JSON NULL');
        }

        if (!$this->has_column('leases', 'contract_required')) {
            $db->raw("ALTER TABLE leases
                MODIFY status ENUM('offered','scheduled','active','ended','expired','cancelled') NOT NULL DEFAULT 'active',
                DROP INDEX one_active_lease_per_unit,
                DROP COLUMN active_unit_id,
                ADD COLUMN active_unit_id INT UNSIGNED GENERATED ALWAYS AS (IF(status IN ('scheduled','active'), unit_id, NULL)) STORED,
                ADD UNIQUE KEY one_active_lease_per_unit (active_unit_id),
                ADD COLUMN current_tenant_id INT UNSIGNED GENERATED ALWAYS AS (IF(status IN ('offered','scheduled','active'), tenant_id, NULL)) STORED,
                ADD UNIQUE KEY one_current_lease_per_tenant (current_tenant_id),
                ADD COLUMN contract_required TINYINT(1) UNSIGNED NOT NULL DEFAULT 0 AFTER estimated_annual_income,
                ADD COLUMN contract_json JSON NULL AFTER contract_required,
                ADD COLUMN tenant_accepted_at DATETIME NULL AFTER contract_json");
        }
    }

    public function down()
    {
        $db = $this->_lava->db;
        if ($this->has_column('leases', 'contract_required')) {
            $db->raw("UPDATE leases SET status = 'ended' WHERE status IN ('offered','scheduled','expired','cancelled')");
            $db->raw("ALTER TABLE leases
                DROP INDEX one_active_lease_per_unit,
                DROP INDEX one_current_lease_per_tenant,
                DROP COLUMN active_unit_id,
                DROP COLUMN current_tenant_id,
                DROP COLUMN contract_required,
                DROP COLUMN contract_json,
                DROP COLUMN tenant_accepted_at,
                MODIFY status ENUM('active','ended') NOT NULL DEFAULT 'active',
                ADD COLUMN active_unit_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', unit_id, NULL)) STORED,
                ADD UNIQUE KEY one_active_lease_per_unit (active_unit_id)");
        }
        if ($this->has_column('units', 'contract_template')) {
            $db->raw('ALTER TABLE units DROP COLUMN contract_template');
        }
        if ($this->has_column('units', 'default_due_day')) {
            $db->raw('ALTER TABLE units DROP COLUMN default_due_day');
        }
        if ($this->has_column('units', 'default_deposit')) {
            $db->raw('ALTER TABLE units DROP COLUMN default_deposit');
        }
        if ($this->has_column('properties', 'contract_template')) {
            $db->raw('ALTER TABLE properties DROP COLUMN contract_template');
        }
    }
}