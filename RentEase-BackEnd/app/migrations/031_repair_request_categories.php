<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Store the selected tenant repair category; priority is derived from that category. */
class Repair_request_categories
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $exists = $this->_lava->db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maintenance_requests'
                AND COLUMN_NAME = 'category'"
        )->fetchColumn();
        if (!$exists) {
            $this->_lava->db->raw("ALTER TABLE maintenance_requests
                ADD COLUMN category VARCHAR(120) NOT NULL DEFAULT 'Other' AFTER title");
        }
    }

    public function down()
    {
        $exists = $this->_lava->db->raw(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maintenance_requests'
                AND COLUMN_NAME = 'category'"
        )->fetchColumn();
        if ($exists) {
            $this->_lava->db->raw('ALTER TABLE maintenance_requests DROP COLUMN category');
        }
    }
}
