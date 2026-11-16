<?php

class Create_refresh_tokens_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token       TEXT NOT NULL,
  expires_at  DATETIME NOT NULL,
  jti         TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY user_id_idx (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS refresh_tokens');
    }
}
