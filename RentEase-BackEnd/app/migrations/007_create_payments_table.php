<?php

/**
 * RentEase - payments table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_payments_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS payments (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  bill_id               INT UNSIGNED NOT NULL,
  tenant_id             INT UNSIGNED NOT NULL,
  amount                DECIMAL(10,2) NOT NULL,
  method                ENUM('paymongo','cash','bank_transfer') NOT NULL DEFAULT 'paymongo',
  status                ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  receipt_no            VARCHAR(30)  NULL,
  paymongo_checkout_id  VARCHAR(100) NULL,
  paymongo_payment_ref  VARCHAR(100) NULL,
  recorded_by           INT UNSIGNED NULL,
  notes                 VARCHAR(255) NULL,
  paid_at               DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY receipt_unique (receipt_no),
  UNIQUE KEY checkout_unique (paymongo_checkout_id),
  KEY bill_idx (bill_id),
  KEY tenant_idx (tenant_id),
  KEY status_idx (status),
  CONSTRAINT fk_payments_bill     FOREIGN KEY (bill_id)     REFERENCES bills (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_tenant   FOREIGN KEY (tenant_id)   REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS payments');
    }
}
