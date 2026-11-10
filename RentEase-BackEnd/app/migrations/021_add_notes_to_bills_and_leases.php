<?php

/**
 * Migration 021: Add notes columns to bills and leases tables.
 *   bills.notes  - optional landlord note shown on the bill / statement
 *   leases.notes - internal note visible only to the landlord
 */
class Add_notes_to_bills_and_leases {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        // Add notes to bills — check first to stay idempotent on MySQL versions that lack IF NOT EXISTS
        $bills_has_notes = $this->_lava->db->raw(
            "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'notes'"
        )->fetch(\PDO::FETCH_ASSOC);
        if (!(int) $bills_has_notes['c']) {
            $this->_lava->db->raw("ALTER TABLE bills ADD COLUMN notes VARCHAR(500) NULL DEFAULT NULL AFTER paid_at");
        }

        // Add notes to leases
        $leases_has_notes = $this->_lava->db->raw(
            "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leases' AND COLUMN_NAME = 'notes'"
        )->fetch(\PDO::FETCH_ASSOC);
        if (!(int) $leases_has_notes['c']) {
            $this->_lava->db->raw("ALTER TABLE leases ADD COLUMN notes TEXT NULL DEFAULT NULL AFTER updated_at");
        }
    }

    public function down()
    {
        $this->_lava->db->raw("ALTER TABLE bills  DROP COLUMN IF EXISTS notes");
        $this->_lava->db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS notes");
    }
}
