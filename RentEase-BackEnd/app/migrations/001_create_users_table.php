<?php

/**
 * RentEase - users table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_users_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username              VARCHAR(50)  NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  password              VARCHAR(255) NOT NULL,
  full_name             VARCHAR(120) NOT NULL DEFAULT '',
  phone                 VARCHAR(30)  NULL,
  role                  ENUM('admin','tenant') NOT NULL DEFAULT 'tenant',
  google_id             VARCHAR(64)  NULL,
  is_active             TINYINT(1) UNSIGNED NOT NULL DEFAULT 1,
  must_change_password  TINYINT(1) UNSIGNED NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY username_unique (username),
  UNIQUE KEY email_unique (email),
  UNIQUE KEY google_id_unique (google_id),
  KEY role_idx (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS users');
    }
}
