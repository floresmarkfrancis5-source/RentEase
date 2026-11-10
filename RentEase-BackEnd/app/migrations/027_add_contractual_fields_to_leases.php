<?php

/**
 * Migration 027: Add contractual and financial projection fields to leases table.
 *   contract_term           - 'monthly', 'annually', 'custom'
 *   contract_months         - length of contract in months (e.g. 12 for 1 year)
 *   advance_payment         - upfront advance rent paid
 *   down_payment            - initial down payment / reservation fee
 *   estimated_annual_income - calculated projected annual revenue (monthly_rent * 12)
 */
class Add_contractual_fields_to_leases
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;

        // Check if contract_term column already exists
        $check = $db->raw(
            "SELECT COUNT(*) AS c FROM information_schema.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leases' AND COLUMN_NAME = 'contract_term'"
        )->fetch(\PDO::FETCH_ASSOC);

        if (!(int) ($check['c'] ?? 0)) {
            $db->raw(
                "ALTER TABLE leases
                 ADD COLUMN contract_term VARCHAR(20) NOT NULL DEFAULT 'monthly' AFTER due_day,
                 ADD COLUMN contract_months INT UNSIGNED NULL DEFAULT 12 AFTER contract_term,
                 ADD COLUMN advance_payment DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER contract_months,
                 ADD COLUMN down_payment DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER advance_payment,
                 ADD COLUMN estimated_annual_income DECIMAL(10,2) NULL DEFAULT NULL AFTER down_payment"
            );

            // Populate estimated_annual_income for existing leases: monthly_rent * 12
            $db->raw("UPDATE leases SET estimated_annual_income = monthly_rent * 12 WHERE estimated_annual_income IS NULL");
        }
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS estimated_annual_income");
        $db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS down_payment");
        $db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS advance_payment");
        $db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS contract_months");
        $db->raw("ALTER TABLE leases DROP COLUMN IF EXISTS contract_term");
    }
}
