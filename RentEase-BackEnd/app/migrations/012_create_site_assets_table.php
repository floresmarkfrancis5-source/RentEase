<?php

/**
 * RentEase - site_assets table
 * Logo, homepage hero and login images uploaded by the admin. They are stored in the database (not on
 * disk) because Render's free web service has an ephemeral file system - uploads would vanish on every deploy.
 */
class Create_site_assets_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS site_assets (
  asset_key   VARCHAR(32)  NOT NULL,
  mime        VARCHAR(40)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  byte_size   INT UNSIGNED NOT NULL,
  updated_by  INT UNSIGNED NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_key),
  CONSTRAINT fk_site_assets_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS site_assets');
    }
}
