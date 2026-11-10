<?php

/** Add indexes for the dashboard's date filters and owner-scoped joins. */
class Add_dashboard_query_indexes
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $indexes = [
            'payments' => ['idx_payments_status_paid_at', 'status, paid_at'],
            'bills' => ['idx_bills_period_month', 'period_month'],
            'leases' => ['idx_leases_status_end_date', 'status, end_date'],
            'maintenance_requests' => ['idx_maintenance_unit_status', 'unit_id, status'],
        ];

        foreach ($indexes as $table => [$name, $columns]) {
            $exists = $this->_lava->db->raw(
                "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                [$table, $name]
            )->fetchColumn();
            if (!$exists) {
                $this->_lava->db->raw("ALTER TABLE {$table} ADD INDEX {$name} ({$columns})");
            }
        }
    }

    public function down()
    {
        $indexes = [
            'payments' => 'idx_payments_status_paid_at',
            'bills' => 'idx_bills_period_month',
            'leases' => 'idx_leases_status_end_date',
            'maintenance_requests' => 'idx_maintenance_unit_status',
        ];

        foreach ($indexes as $table => $name) {
            $exists = $this->_lava->db->raw(
                "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                [$table, $name]
            )->fetchColumn();
            if ($exists) {
                $this->_lava->db->raw("ALTER TABLE {$table} DROP INDEX {$name}");
            }
        }
    }
}
