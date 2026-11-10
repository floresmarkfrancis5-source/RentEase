<?php

/**
 * Migration 022: Add email_verified_at to users table and create tenant_invitation_tokens table.
 */
class Tenant_invitation_and_email_verification
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;

        // Check if email_verified_at already exists in users
        $has_email_verified = $db->raw(
            "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at'"
        )->fetch(\PDO::FETCH_ASSOC);

        if (!(int) ($has_email_verified['c'] ?? 0)) {
            $db->raw("ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL AFTER email");
            // Automatically mark existing landlords, superadmins, and users with google_id as verified
            $db->raw("UPDATE users SET email_verified_at = created_at WHERE role IN ('admin', 'superadmin') OR google_id IS NOT NULL");
        }

        // Create tenant_invitation_tokens table
        $db->raw(
            "CREATE TABLE IF NOT EXISTS tenant_invitation_tokens (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id INT UNSIGNED NOT NULL,
                token_hash CHAR(64) NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY tenant_invite_token_hash (token_hash),
                KEY tenant_invite_user_created (user_id, created_at),
                CONSTRAINT fk_tenant_invite_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw("DROP TABLE IF EXISTS tenant_invitation_tokens");
        $has_email_verified = $db->raw(
            "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at'"
        )->fetch(\PDO::FETCH_ASSOC);
        if ((int) ($has_email_verified['c'] ?? 0)) {
            $db->raw("ALTER TABLE users DROP COLUMN email_verified_at");
        }
    }
}
