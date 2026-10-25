<?php

/**
 * RentEase - landlord self-registration, onboarding state, and tenant ownership.
 */
class Landlord_accounts_and_tenant_ownership
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;
        $has_landlord_id = $db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'landlord_id'"
        )->fetchColumn();
        if (!$has_landlord_id) {
            $db->raw("ALTER TABLE users ADD COLUMN landlord_id INT UNSIGNED NULL AFTER role");
        }

        $has_onboarding = $db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'onboarding_completed'"
        )->fetchColumn();
        if (!$has_onboarding) {
            $db->raw("ALTER TABLE users ADD COLUMN onboarding_completed TINYINT(1) UNSIGNED NOT NULL DEFAULT 1 AFTER landlord_id");
        }

        $has_landlord_key = $db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'user_landlord_idx'"
        )->fetchColumn();
        if (!$has_landlord_key) {
            $db->raw("ALTER TABLE users ADD KEY user_landlord_idx (landlord_id)");
        }

        $has_landlord_fk = $db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
              WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_user_landlord'"
        )->fetchColumn();
        if (!$has_landlord_fk) {
            $db->raw(
                'ALTER TABLE users ADD CONSTRAINT fk_user_landlord FOREIGN KEY (landlord_id) REFERENCES users (id) ON DELETE RESTRICT'
            );
        }

        $db->raw(
            "UPDATE users tenant
               SET tenant.landlord_id = (
                   SELECT property.owner_id
                     FROM leases lease
                     JOIN units unit ON unit.id = lease.unit_id
                     JOIN properties property ON property.id = unit.property_id
                    WHERE lease.tenant_id = tenant.id AND lease.status = 'active'
                    ORDER BY lease.id DESC LIMIT 1
               )
             WHERE tenant.role = 'tenant' AND tenant.landlord_id IS NULL
               AND EXISTS (SELECT 1 FROM leases active_lease
                            WHERE active_lease.tenant_id = tenant.id AND active_lease.status = 'active')"
        );
        $db->raw(
            "UPDATE users tenant
               SET tenant.landlord_id = (
                   SELECT property.owner_id
                     FROM leases lease
                     JOIN units unit ON unit.id = lease.unit_id
                     JOIN properties property ON property.id = unit.property_id
                    WHERE lease.tenant_id = tenant.id
                    ORDER BY lease.id DESC LIMIT 1
               )
             WHERE tenant.role = 'tenant' AND tenant.landlord_id IS NULL
               AND EXISTS (SELECT 1 FROM leases historical_lease
                            WHERE historical_lease.tenant_id = tenant.id)"
        );

        $db->raw(
            "UPDATE users tenant
              JOIN users legacy_landlord ON legacy_landlord.role = 'admin'
               SET tenant.landlord_id = legacy_landlord.id
             WHERE tenant.role = 'tenant' AND tenant.landlord_id IS NULL
               AND legacy_landlord.id = (SELECT MIN(id) FROM (SELECT id FROM users WHERE role = 'admin') first_admin)"
        );
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw('ALTER TABLE users DROP FOREIGN KEY fk_user_landlord');
        $db->raw('ALTER TABLE users DROP KEY user_landlord_idx');
        $db->raw('ALTER TABLE users DROP COLUMN onboarding_completed, DROP COLUMN landlord_id');
    }
}
