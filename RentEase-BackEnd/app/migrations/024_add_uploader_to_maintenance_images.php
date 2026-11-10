<?php

/**
 * RentEase - add uploaded_by and uploader_role to maintenance_images
 * Allows both tenants (issue photos) and landlords (resolution/repair proof photos) to attach photos.
 */
class Add_uploader_to_maintenance_images {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $sql = <<<'SQL'
ALTER TABLE maintenance_images
  ADD COLUMN uploaded_by   INT UNSIGNED NULL AFTER request_id,
  ADD COLUMN uploader_role ENUM('tenant', 'landlord') NOT NULL DEFAULT 'tenant' AFTER uploaded_by,
  ADD CONSTRAINT fk_maintenance_images_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL;
SQL;
        try {
            $this->_lava->db->raw($sql);
        } catch (Throwable $e) {}
    }

    public function down()
    {
        try {
            $this->_lava->db->raw('ALTER TABLE maintenance_images DROP FOREIGN KEY fk_maintenance_images_user');
            $this->_lava->db->raw('ALTER TABLE maintenance_images DROP COLUMN uploader_role, DROP COLUMN uploaded_by');
        } catch (Throwable $e) {}
    }
}
