<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Report_model - read-only numbers for the landlord dashboard. */
class Report_model extends Model
{
    protected $table = 'payments';
    private $query_timings = [];

    private function timed_query($name, $sql, $args = [], $fetch_all = false)
    {
        $started = microtime(true);
        try {
            $statement = $this->db->raw($sql, $args);
            return $fetch_all
                ? $statement->fetchAll(PDO::FETCH_ASSOC)
                : $statement->fetch(PDO::FETCH_ASSOC);
        } finally {
            $this->query_timings[$name] = round((microtime(true) - $started) * 1000, 1);
        }
    }

    public function dashboard($landlord_id = null)
    {
        $dashboard_started = microtime(true);
        $this->query_timings = [];
        $owner = $landlord_id === null ? '' : ' AND p.owner_id = ?';
        $owner_args = $landlord_id === null ? [] : [(int) $landlord_id];
        $summary = $this->timed_query('summary', "SELECT
                payments.this_month AS collected_this_month,
                payments.all_time AS collected_all_time,
                payments.payments_count,
                bills.outstanding,
                bills.outstanding_count,
                bills.overdue,
                bills.overdue_count,
                units.total AS total_units,
                units.occupied AS occupied_units,
                units.vacant AS vacant_units,
                counts.properties,
                counts.tenants,
                counts.open_maintenance,
                finances.active_leases_count,
                finances.total_monthly_rent,
                finances.estimated_annual_income
            FROM (
                SELECT COALESCE(SUM(CASE WHEN pm.paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN pm.amount END), 0) AS this_month,
                       COALESCE(SUM(pm.amount), 0) AS all_time,
                       COUNT(*) AS payments_count
                  FROM payments pm JOIN bills b ON b.id = pm.bill_id
                  JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
                  JOIN properties p ON p.id = u.property_id
                 WHERE pm.status = 'paid'" . $owner . "
            ) payments
            CROSS JOIN (
                SELECT COALESCE(SUM(CASE WHEN b.status IN ('unpaid','overdue') THEN b.amount END), 0) AS outstanding,
                       COALESCE(SUM(b.status IN ('unpaid','overdue')), 0) AS outstanding_count,
                       COALESCE(SUM(CASE WHEN b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE()) THEN b.amount END), 0) AS overdue,
                       COALESCE(SUM(b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE())), 0) AS overdue_count
                  FROM bills b JOIN leases l ON l.id = b.lease_id
                  JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                 WHERE 1=1" . $owner . "
            ) bills
            CROSS JOIN (
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(u.occupancy_status = 'occupied'), 0) AS occupied,
                       COALESCE(SUM(u.occupancy_status = 'vacant'), 0) AS vacant
                  FROM units u JOIN properties p ON p.id = u.property_id
                 WHERE 1=1" . $owner . "
            ) units
            CROSS JOIN (
                SELECT (SELECT COUNT(*) FROM properties p WHERE 1=1" . $owner . ") AS properties,
                       (SELECT COUNT(*) FROM users t WHERE t.role = 'tenant' AND t.is_active = 1"
                           . ($landlord_id === null ? '' : ' AND t.landlord_id = ?') . ") AS tenants,
                       (SELECT COUNT(*) FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
                         JOIN properties p ON p.id = u.property_id
                        WHERE m.status IN ('pending','in_progress')" . $owner . ") AS open_maintenance
            ) counts
            CROSS JOIN (
                SELECT COUNT(l.id) AS active_leases_count,
                       COALESCE(SUM(l.monthly_rent), 0) AS total_monthly_rent,
                       COALESCE(SUM(COALESCE(l.estimated_annual_income, l.monthly_rent * 12)), 0) AS estimated_annual_income
                  FROM leases l JOIN units u ON u.id = l.unit_id
                  JOIN properties p ON p.id = u.property_id
                 WHERE l.status = 'active'" . $owner . "
            ) finances",
            $landlord_id === null
                ? []
                : array_merge(
                    array_fill(0, 4, (int) $landlord_id),
                    [(int) $landlord_id],
                    array_fill(0, 2, (int) $landlord_id)
                )
        );

        $months = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = date('Y-m', strtotime("first day of -$i month"));
            $months[$m] = ['month' => $m, 'billed' => 0.0, 'collected' => 0.0];
        }
        $monthly = $this->timed_query('monthly', "SELECT monthly.metric, monthly.month, SUM(monthly.amount) AS amount
                 FROM (
                     SELECT 'billed' AS metric, b.period_month AS month, SUM(b.amount) AS amount
                       FROM bills b
                       JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
                       JOIN properties p ON p.id = u.property_id
                      WHERE b.period_month >= ?" . $owner . "
                      GROUP BY b.period_month
                     UNION ALL
                     SELECT 'collected' AS metric, DATE_FORMAT(pm.paid_at, '%Y-%m') AS month, SUM(pm.amount) AS amount
                       FROM payments pm
                       JOIN bills b ON b.id = pm.bill_id JOIN leases l ON l.id = b.lease_id
                       JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                      WHERE pm.status = 'paid' AND pm.paid_at >= ?" . $owner . "
                      GROUP BY DATE_FORMAT(pm.paid_at, '%Y-%m')
                 ) monthly
                GROUP BY monthly.metric, monthly.month",
            array_merge(
                 [array_key_first($months)],
                 $owner_args,
                 [array_key_first($months) . '-01'],
                 $owner_args
            ),
            true
        );
        foreach ($monthly as $r) {
            if (!isset($months[$r['month']])) {
                 continue;
            }
            $key = $r['metric'] === 'billed' ? 'billed' : 'collected';
            $months[$r['month']][$key] = (float) $r['amount'];
        }

        $recent = $this->timed_query('recent_payments',
            "SELECT pm.id, pm.amount, pm.method, pm.paid_at, pm.receipt_no, t.full_name AS tenant_name, u.unit_name
                FROM payments pm JOIN users t ON t.id = pm.tenant_id JOIN bills b ON b.id = pm.bill_id
                JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               WHERE pm.status = 'paid'" . $owner . " ORDER BY pm.paid_at DESC LIMIT 5",
            $owner_args,
            true
        );

        $late = $this->timed_query('overdue_bills',
            "SELECT b.id, b.amount, b.due_date, b.period_month, t.full_name AS tenant_name, u.unit_name,
                     DATEDIFF(CURDATE(), b.due_date) AS days_late
                FROM bills b JOIN users t ON t.id = b.tenant_id JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               WHERE (b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE()))" . $owner . " ORDER BY b.due_date ASC LIMIT 5",
            $owner_args,
            true
        );

        $expiring = $this->timed_query('expiring_leases',
            "SELECT l.id, l.end_date, DATEDIFF(l.end_date, CURDATE()) AS days_left,
                     t.full_name AS tenant_name, u.unit_name, p.name AS property_name
                FROM leases l JOIN users t ON t.id = l.tenant_id JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               WHERE l.status = 'active' AND l.end_date IS NOT NULL AND l.end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            " . $owner . " ORDER BY l.end_date ASC LIMIT 10",
            $owner_args,
            true
        );

        $result = [
            'collected'      => ['this_month' => (float) $summary['collected_this_month'], 'all_time' => (float) $summary['collected_all_time'], 'payments_count' => (int) $summary['payments_count']],
            'outstanding'    => ['amount' => (float) $summary['outstanding'], 'count' => (int) $summary['outstanding_count']],
            'overdue'        => ['amount' => (float) $summary['overdue'], 'count' => (int) $summary['overdue_count']],
            'units'          => ['total' => (int) $summary['total_units'], 'occupied' => (int) $summary['occupied_units'], 'vacant' => (int) $summary['vacant_units']],
            'properties'     => (int) $summary['properties'],
            'tenants'        => (int) $summary['tenants'],
            'open_maintenance' => (int) $summary['open_maintenance'],
            'financials'     => [
                'active_leases_count' => (int) $summary['active_leases_count'],
                'total_monthly_rent' => (float) $summary['total_monthly_rent'],
                'estimated_annual_income' => (float) $summary['estimated_annual_income'],
            ],
            'monthly'        => array_values($months),
            'recent_payments' => $recent,
            'overdue_bills'  => $late,
            'expiring_leases' => $expiring,
        ];

        $this->query_timings['dashboard'] = round((microtime(true) - $dashboard_started) * 1000, 1);
        $server_timing = [];
        foreach ($this->query_timings as $name => $duration) {
            $server_timing[] = $name . ';dur=' . $duration;
        }
        header('Server-Timing: ' . implode(', ', $server_timing));
        if (filter_var(getenv('DASHBOARD_QUERY_TIMING') ?: 'false', FILTER_VALIDATE_BOOLEAN)) {
            error_log('RentEase dashboard timings: ' . json_encode($this->query_timings));
        }

        return $result;
    }
}
