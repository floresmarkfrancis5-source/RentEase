<?php

/**
 * RentEase - add image_url to maintenance_images
 * Stores direct Cloudinary CDN URLs and allows data BLOB to be nullable.
 */
class Add_image_url_to_maintenance_images {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
ALTER TABLE maintenance_images
  ADD COLUMN image_url VARCHAR(500) NULL AFTER file_name,
  MODIFY COLUMN data MEDIUMBLOB NULL;
SQL;
        try {
            $this->_lava->db->raw($sql);
        } catch (Throwable $e) {}
    }

    public function down()
    {
        try {
            $this->_lava->db->raw('ALTER TABLE maintenance_images DROP COLUMN image_url, MODIFY COLUMN data MEDIUMBLOB NOT NULL');
        } catch (Throwable $e) {}
    }
}
