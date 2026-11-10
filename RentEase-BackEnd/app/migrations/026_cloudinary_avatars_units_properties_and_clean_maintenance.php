<?php

/**
 * Migration 026:
 * 1. Adds avatar_url to user_avatars (and makes data nullable).
 * 2. Adds image_url to properties.
 * 3. Adds image_url to units.
 * 4. Cleans out all development maintenance requests and images to eliminate old heavy blobs.
 */
class Cloudinary_avatars_units_properties_and_clean_maintenance {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        // 1. user_avatars: add avatar_url and allow data to be null
        try {
            $this->_lava->db->raw(
                "ALTER TABLE user_avatars ADD COLUMN avatar_url VARCHAR(500) NULL AFTER mime, MODIFY COLUMN data MEDIUMBLOB NULL"
            );
        } catch (Throwable $e) {}

        // 2. properties: add image_url
        try {
            $this->_lava->db->raw(
                "ALTER TABLE properties ADD COLUMN image_url VARCHAR(500) NULL AFTER description"
            );
        } catch (Throwable $e) {}

        // 3. units: add image_url
        try {
            $this->_lava->db->raw(
                "ALTER TABLE units ADD COLUMN image_url VARCHAR(500) NULL AFTER notes"
            );
        } catch (Throwable $e) {}

        // 4. Purge old heavy maintenance requests and images
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
