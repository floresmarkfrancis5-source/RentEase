<?php

class Cloudinary_avatars_units_properties_and_clean_maintenance {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        try {
            $this->_lava->db->raw(
                "ALTER TABLE user_avatars ADD COLUMN avatar_url VARCHAR(500) NULL AFTER mime, MODIFY COLUMN data MEDIUMBLOB NULL"
            );
        } catch (Throwable $e) {}

        try {
            $this->_lava->db->raw(
                "ALTER TABLE properties ADD COLUMN image_url VARCHAR(500) NULL AFTER description"
            );
        } catch (Throwable $e) {}

        try {
            $this->_lava->db->raw(
                "ALTER TABLE units ADD COLUMN image_url VARCHAR(500) NULL AFTER notes"
            );
        } catch (Throwable $e) {}

        try {
            $this->_lava->db->raw("DELETE FROM maintenance_images");
            $this->_lava->db->raw("DELETE FROM maintenance_requests");
            $this->_lava->db->raw("DELETE FROM in_app_notifications WHERE type IN ('new_maintenance_request', 'maintenance_update')");
            $this->_lava->db->raw("DELETE FROM notifications_log WHERE type IN ('new_maintenance_request', 'maintenance_update')");
        } catch (Throwable $e) {}
    }

    public function down()
    {
        try {
            $this->_lava->db->raw("ALTER TABLE user_avatars DROP COLUMN avatar_url, MODIFY COLUMN data MEDIUMBLOB NOT NULL");
        } catch (Throwable $e) {}
        try {
            $this->_lava->db->raw("ALTER TABLE properties DROP COLUMN image_url");
        } catch (Throwable $e) {}
        try {
            $this->_lava->db->raw("ALTER TABLE units DROP COLUMN image_url");
        } catch (Throwable $e) {}
    }
}
