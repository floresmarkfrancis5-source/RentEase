<?php

/**
 * RentEase - superadmin accounts and single-use email password reset links.
 */
class Superadmin_and_password_reset
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;
        $has_superadmin = $db->raw("SELECT 1 FROM users WHERE role = 'superadmin' LIMIT 1")->fetchColumn();
        $bootstrap = null;
        if (!$has_superadmin) {
            $bootstrap = [
                'email' => strtolower(trim((string) getenv('SUPERADMIN_BOOTSTRAP_EMAIL'))),
                'username' => trim((string) getenv('SUPERADMIN_BOOTSTRAP_USERNAME')),
                'full_name' => trim((string) getenv('SUPERADMIN_BOOTSTRAP_FULL_NAME')),
                'password' => (string) getenv('SUPERADMIN_BOOTSTRAP_PASSWORD'),
            ];
            if ($bootstrap['email'] === '' && $bootstrap['username'] === '' && $bootstrap['full_name'] === '' && $bootstrap['password'] === '') {
                throw new RuntimeException('Set private SUPERADMIN_BOOTSTRAP_EMAIL, SUPERADMIN_BOOTSTRAP_USERNAME, SUPERADMIN_BOOTSTRAP_FULL_NAME and SUPERADMIN_BOOTSTRAP_PASSWORD values before running migration 018.');
            }
            if (!filter_var($bootstrap['email'], FILTER_VALIDATE_EMAIL) || strlen($bootstrap['email']) > 255
                || !preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $bootstrap['username'])
                || mb_strlen($bootstrap['full_name']) < 2 || mb_strlen($bootstrap['full_name']) > 120
                || strlen($bootstrap['password']) < 12 || !preg_match('/[A-Za-z]/', $bootstrap['password']) || !preg_match('/\d/', $bootstrap['password'])) {
                throw new RuntimeException('Superadmin bootstrap details are invalid. Use a valid email, a 3–50 character username, a 2–120 character name, and a password of at least 12 characters containing a letter and a number.');
            }
            if ($db->raw('SELECT 1 FROM users WHERE username = ? OR email = ? LIMIT 1', [$bootstrap['username'], $bootstrap['email']])->fetchColumn()) {
                throw new RuntimeException('The configured superadmin bootstrap username or email is already in use.');
            }
        }

        $db->raw("ALTER TABLE users MODIFY role ENUM('admin','tenant','superadmin') NOT NULL DEFAULT 'tenant'");
        $db->raw(
            "CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id INT UNSIGNED NOT NULL,
                token_hash CHAR(64) NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY password_reset_token_hash (token_hash),
                KEY password_reset_user_created (user_id, created_at),
                CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );

        if (!$bootstrap) {
            return;
        }

        $db->raw(
            "INSERT INTO users (username, email, password, full_name, role, is_active, must_change_password, created_at)
             VALUES (?, ?, ?, ?, 'superadmin', 1, 0, NOW())",
            [$bootstrap['username'], $bootstrap['email'], password_hash($bootstrap['password'], PASSWORD_DEFAULT), $bootstrap['full_name']]
        );
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw("UPDATE users SET role = 'admin' WHERE role = 'superadmin'");
        $db->raw('DROP TABLE IF EXISTS password_reset_tokens');
        $db->raw("ALTER TABLE users MODIFY role ENUM('admin','tenant') NOT NULL DEFAULT 'tenant'");
    }
}
