<?php

/**
 * RentEase - bills table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_bills_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS bills (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lease_id      INT UNSIGNED NOT NULL,
  tenant_id     INT UNSIGNED NOT NULL,
  period_month  CHAR(7) NOT NULL,
  description   VARCHAR(150) NOT NULL DEFAULT '',
  amount        DECIMAL(10,2) NOT NULL,
  due_date      DATE NOT NULL,
  status        ENUM('unpaid','paid','overdue') NOT NULL DEFAULT 'unpaid',
  paid_at       DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY one_bill_per_lease_month (lease_id, period_month),
  KEY tenant_idx (tenant_id),
  KEY status_due_idx (status, due_date),
  CONSTRAINT fk_bills_lease  FOREIGN KEY (lease_id)  REFERENCES leases (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bills_tenant FOREIGN KEY (tenant_id) REFERENCES users (id)  ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS bills');
    }
}
