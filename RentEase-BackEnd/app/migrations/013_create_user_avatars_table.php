<?php

/**
 * RentEase - user_avatars table
 * One profile picture per account (admin or tenant). Stored in the database, like the site images,
 * because Render's disk is ephemeral. Deleting the user deletes the picture (ON DELETE CASCADE).
 */
class Create_user_avatars_table {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id     INT UNSIGNED NOT NULL,
  mime        VARCHAR(40)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  byte_size   INT UNSIGNED NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_avatars_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->_lava->db->raw($sql);
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS user_avatars');
    }
}
