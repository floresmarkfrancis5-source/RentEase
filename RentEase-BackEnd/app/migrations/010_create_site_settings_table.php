<?php

/**
 * RentEase - site_settings table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_site_settings_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS site_settings (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key    VARCHAR(64) NOT NULL,
  setting_value  TEXT NULL,
  setting_group  ENUM('branding','colors','hero','appearance') NOT NULL DEFAULT 'branding',
  updated_by     INT UNSIGNED NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_settings_key (setting_key),
  KEY idx_site_settings_group (setting_group),
  CONSTRAINT fk_site_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);

        // Default values come from the model so the schema and the defaults never drift apart.
        $this->_lava->call->model('Site_setting_model');
        foreach (Site_setting_model::SCHEMA as $key => $def) {
            $this->_lava->db->raw(
                'INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_key = setting_key',
                [$key, (string) $def['default'], $def['group']]
            );
        }
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS site_settings');
    }
}
