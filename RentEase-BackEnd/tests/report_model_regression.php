<?php
define('PREVENT_DIRECT_ACCESS', true);

class Model
{
    public $db;
}

class ReportTestStatement
{
    private $sql;

    public function __construct($sql)
    {
        $this->sql = $sql;
    }

    public function fetch($mode = null)
    {
        if (strpos($this->sql, 'payments.this_month AS collected_this_month') !== false) {
            return [
                'collected_this_month' => 1200,
                'collected_all_time' => 8200,
                'payments_count' => 4,
                'outstanding' => 1000,
                'outstanding_count' => 1,
                'overdue' => 500,
                'overdue_count' => 1,
                'total_units' => 5,
                'occupied_units' => 3,
                'vacant_units' => 2,
                'properties' => 2,
                'tenants' => 3,
                'open_maintenance' => 1,
                'active_leases_count' => 3,
                'total_monthly_rent' => 15000,
                'estimated_annual_income' => 180000,
            ];
        }
        if (strpos($this->sql, 'AS collected,') !== false) {
            return [
                'collected' => 2400,
                'payments_count' => 2,
                'bills_created' => 3,
                'lease_events' => 1,
                'transfer_requests' => 1,
                'early_move_requests' => 1,
                'maintenance_records' => 2,
                'new_properties' => 1,
                'new_units' => 2,
            ];
        }
        if (strpos($this->sql, 'AS period_start') !== false) {
            return [
                'period_start' => '2026-10-16',
                'period_end' => '2026-11-14',
                'generated_at' => '2026-11-14 10:00:00',
            ];
        }
        return false;
    }

    public function fetchAll($mode = null)
    {
        return [];
    }
}

class ReportTestDatabase
{
    public $queries = [];

    public function raw($sql, $args = [])
    {
        $this->queries[] = [$sql, $args];
        return new ReportTestStatement($sql);
    }
}

require __DIR__ . '/../app/models/Report_model.php';

$model = new Report_model();
$model->db = new ReportTestDatabase();
$report = $model->landlord_report(7);
$paymentQuery = $model->db->queries[4];
$billQuery = $model->db->queries[5];
$transferQuery = $model->db->queries[7];
if ($paymentQuery[1] !== [7, '2026-10-16', '2026-11-14', '2026-10-16', '2026-11-14']
    || $billQuery[1] !== [7, '2026-10-16', '2026-11-14']
    || $transferQuery[1] !== [7, 7, '2026-10-16', '2026-11-14', '2026-10-16', '2026-11-14']) {
    throw new RuntimeException('Landlord report queries did not bind the period and owner consistently.');
}
if ($report['period']['start'] !== '2026-10-16' || $report['properties'] !== [] || $report['units'] !== []) {
    throw new RuntimeException('Landlord report did not return its period and complete inventory sections.');
}

$metrics = $model->landlord_report_summary_metrics(7);
$summaryQueries = array_values(array_filter($model->db->queries, static function ($query) {
    return strpos($query[0], 'AS collected,') !== false;
}));
$summaryQuery = $summaryQueries[0] ?? null;

if ($metrics['collected'] !== 2400.0 || $metrics['payments_count'] !== 2) {
    throw new RuntimeException('Report metrics did not preserve the period payment totals.');
}
if (!$summaryQuery || count($summaryQuery[1]) !== 10 || count(array_unique($summaryQuery[1])) !== 1 || $summaryQuery[1][0] !== 7) {
    throw new RuntimeException('Report activity metrics were not consistently scoped to the landlord.');
}
if (strpos($summaryQuery[0], 'requested_p.owner_id = ?') === false) {
    throw new RuntimeException('Transfer report metrics did not scope both properties to the landlord.');
}
if ($metrics['early_move_requests'] !== 1) {
    throw new RuntimeException('Early move-in request activity was missing from the report metrics.');
}

echo "Report model regression checks passed.\n";
