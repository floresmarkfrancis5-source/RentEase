<?php

/**
 * RentEase - site_settings_log table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_site_settings_log_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS site_settings_log (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key  VARCHAR(64) NOT NULL,
  old_value    TEXT NULL,
  new_value    TEXT NULL,
  changed_by   INT UNSIGNED NULL,
  changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_settings_log_key (setting_key),
  KEY idx_settings_log_time (changed_at),
  CONSTRAINT fk_settings_log_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS site_settings_log');
    }
}
