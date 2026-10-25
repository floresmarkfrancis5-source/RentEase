<?php

/**
 * RentEase - barangay location and tenant unit transfer requests.
 */
class Add_property_barangay_and_unit_transfer_requests {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $has_barangay = $this->_lava->db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'barangay'"
        )->fetchColumn();
        if (!$has_barangay) {
            $this->_lava->db->raw("ALTER TABLE properties ADD COLUMN barangay VARCHAR(100) NOT NULL DEFAULT '' AFTER city");
        }
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS unit_transfer_requests (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          INT UNSIGNED NOT NULL,
  current_unit_id    INT UNSIGNED NOT NULL,
  requested_unit_id  INT UNSIGNED NOT NULL,
  reason             TEXT NULL,
  status             ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note         TEXT NULL,
  decided_by         INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at         DATETIME NULL,
  pending_tenant_id  INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'pending', tenant_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY one_pending_transfer_per_tenant (pending_tenant_id),
  KEY transfer_status_idx (status, created_at),
  KEY transfer_tenant_idx (tenant_id),
  CONSTRAINT fk_transfer_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_current_unit FOREIGN KEY (current_unit_id) REFERENCES units (id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_requested_unit FOREIGN KEY (requested_unit_id) REFERENCES units (id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS unit_transfer_requests');
        $this->_lava->db->raw('ALTER TABLE properties DROP COLUMN barangay');
    }
}
