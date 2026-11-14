<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Add reversible archive timestamps for properties and units. */
class Archive_properties_and_units
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $this->_lava->db->raw(
            'ALTER TABLE properties ADD COLUMN archived_at DATETIME NULL DEFAULT NULL,
             ADD INDEX properties_archive_owner (owner_id, archived_at)'
        );
        $this->_lava->db->raw(
            'ALTER TABLE units ADD COLUMN archived_at DATETIME NULL DEFAULT NULL,
             ADD INDEX units_archive_property (property_id, archived_at)'
        );
    }

    public function down()
    {
        $this->_lava->db->raw(
            'ALTER TABLE units DROP INDEX units_archive_property, DROP COLUMN archived_at'
        );
        $this->_lava->db->raw(
            'ALTER TABLE properties DROP INDEX properties_archive_owner, DROP COLUMN archived_at'
        );
    }
}
