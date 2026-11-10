<?php

/**
 * RentEase - maintenance_images table
 * Stores photos and images attached to maintenance repair requests.
 * Uses MEDIUMBLOB so images are securely stored in MySQL and preserved across server restarts.
 * Supports multiple images per repair request.
 */
class Create_maintenance_images_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS maintenance_images (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id  INT UNSIGNED NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  byte_size   INT UNSIGNED NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY request_idx (request_id),
  CONSTRAINT fk_maintenance_images_request FOREIGN KEY (request_id) REFERENCES maintenance_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);

        // Expand notifications_log type enum to include new_maintenance_request
        try {
            $this->_lava->db->raw("ALTER TABLE notifications_log MODIFY COLUMN type ENUM('welcome','due_reminder','payment_confirmation','maintenance_update','new_maintenance_request','other') NOT NULL DEFAULT 'other'");
        } catch (Throwable $e) {}
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS maintenance_images');
    }
}
