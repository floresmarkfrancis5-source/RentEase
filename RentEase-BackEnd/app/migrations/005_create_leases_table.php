<?php

/**
 * RentEase - leases table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_leases_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS leases (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  unit_id         INT UNSIGNED NOT NULL,
  tenant_id       INT UNSIGNED NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NULL,
  monthly_rent    DECIMAL(10,2) NOT NULL,
  deposit         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  due_day         TINYINT UNSIGNED NOT NULL DEFAULT 5,
  status          ENUM('active','ended') NOT NULL DEFAULT 'active',
  active_unit_id  INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', unit_id, NULL)) STORED,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY one_active_lease_per_unit (active_unit_id),
  KEY tenant_idx (tenant_id),
  KEY status_idx (status),
  CONSTRAINT fk_leases_unit   FOREIGN KEY (unit_id)   REFERENCES units (id) ON DELETE RESTRICT,
  CONSTRAINT fk_leases_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS leases');
    }
}
