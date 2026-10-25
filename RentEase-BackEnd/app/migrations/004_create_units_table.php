<?php

/**
 * RentEase - units table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_units_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS units (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id   INT UNSIGNED NOT NULL,
  unit_name     VARCHAR(50)  NOT NULL,
  monthly_rent  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  capacity      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status        ENUM('vacant','occupied','maintenance') NOT NULL DEFAULT 'vacant',
  notes         VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY unit_per_property (property_id, unit_name),
  CONSTRAINT fk_units_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS units');
    }
}
