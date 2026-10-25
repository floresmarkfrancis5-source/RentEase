<?php

/**
 * RentEase - maintenance_requests table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_maintenance_requests_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    INT UNSIGNED NOT NULL,
  unit_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(120) NOT NULL,
  description  TEXT NOT NULL,
  priority     ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status       ENUM('pending','in_progress','resolved') NOT NULL DEFAULT 'pending',
  admin_notes  TEXT NULL,
  resolved_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY tenant_idx (tenant_id),
  KEY status_idx (status),
  CONSTRAINT fk_maint_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_maint_unit   FOREIGN KEY (unit_id)   REFERENCES units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS maintenance_requests');
    }
}
