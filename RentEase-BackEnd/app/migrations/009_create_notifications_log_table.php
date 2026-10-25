<?php

/**
 * RentEase - notifications_log table
 * Raw SQL is used here so foreign keys, a generated column and ENUMs are created exactly as designed.
 * Table order matters: parents are created before the tables that reference them.
 */
class Create_notifications_log_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS notifications_log (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  type        ENUM('welcome','due_reminder','payment_confirmation','maintenance_update','other') NOT NULL DEFAULT 'other',
  related_id  INT UNSIGNED NULL,
  channel     ENUM('email') NOT NULL DEFAULT 'email',
  recipient   VARCHAR(255) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  status      ENUM('sent','failed','skipped') NOT NULL,
  error       VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY user_idx (user_id),
  KEY type_related_idx (type, related_id, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS notifications_log');
    }
}
