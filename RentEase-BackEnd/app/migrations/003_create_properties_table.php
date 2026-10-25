<?php

/**
 * RentEase - properties table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_properties_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS properties (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id     INT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,
  type         ENUM('apartment','boarding_house') NOT NULL DEFAULT 'apartment',
  address      VARCHAR(255) NOT NULL,
  city         VARCHAR(100) NOT NULL DEFAULT '',
  latitude     DECIMAL(10,7) NULL,
  longitude    DECIMAL(10,7) NULL,
  description  TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY owner_idx (owner_id),
  CONSTRAINT fk_properties_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS properties');
    }
}
