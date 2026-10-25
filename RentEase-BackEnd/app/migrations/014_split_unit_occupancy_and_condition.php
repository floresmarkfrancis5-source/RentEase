<?php

/**
 * RentEase - separate lease-driven occupancy from unit condition.
 */
class Split_unit_occupancy_and_condition {

    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $this->_lava->db->raw("ALTER TABLE units
            ADD COLUMN occupancy_status ENUM('vacant','occupied') NOT NULL DEFAULT 'vacant' AFTER capacity,
            ADD COLUMN condition_tag ENUM('good_condition','under_maintenance') NOT NULL DEFAULT 'good_condition' AFTER occupancy_status");
        $this->_lava->db->raw("UPDATE units SET
            condition_tag = CASE WHEN status = 'maintenance' THEN 'under_maintenance' ELSE 'good_condition' END,
            occupancy_status = CASE WHEN EXISTS (
                SELECT 1 FROM leases WHERE leases.unit_id = units.id AND leases.status = 'active'
            ) THEN 'occupied' ELSE 'vacant' END");
        $this->_lava->db->raw('ALTER TABLE units DROP COLUMN status');
    }

    public function down()
    {
        $this->_lava->db->raw("ALTER TABLE units
            ADD COLUMN status ENUM('vacant','occupied','maintenance') NOT NULL DEFAULT 'vacant' AFTER capacity");
        $this->_lava->db->raw("UPDATE units SET status = CASE
            WHEN condition_tag = 'under_maintenance' THEN 'maintenance'
            ELSE occupancy_status END");
        $this->_lava->db->raw('ALTER TABLE units DROP COLUMN condition_tag, DROP COLUMN occupancy_status');
    }
}
