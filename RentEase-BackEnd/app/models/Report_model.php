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
                 WHERE u.archived_at IS NULL AND p.archived_at IS NULL" . $owner . "
            ) units
            CROSS JOIN (
                SELECT (SELECT COUNT(*) FROM properties p WHERE p.archived_at IS NULL" . $owner . ") AS properties,
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

    public function landlord_report($landlord_id)
    {
        $landlord_id = (int) $landlord_id;
        $range = $this->db->raw(
            "SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 29 DAY), '%Y-%m-%d') AS period_start,
                    DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS period_end,
                    DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS generated_at"
        )->fetch(PDO::FETCH_ASSOC);
        $start = $range['period_start'];
        $end = $range['period_end'];
        $owner_args = [$landlord_id];
        $period_args = [$landlord_id, $start, $end];

        $properties = $this->db->raw(
            "SELECT p.id, p.name, p.type, p.address, p.barangay, p.city, p.created_at, p.updated_at,
                    COUNT(u.id) AS unit_count,
                    COALESCE(SUM(u.occupancy_status = 'occupied'), 0) AS occupied_units,
                    COALESCE(SUM(u.occupancy_status = 'vacant'), 0) AS vacant_units
               FROM properties p
               LEFT JOIN units u ON u.property_id = p.id AND u.archived_at IS NULL
              WHERE p.owner_id = ? AND p.archived_at IS NULL
              GROUP BY p.id, p.name, p.type, p.address, p.barangay, p.city, p.created_at, p.updated_at
              ORDER BY p.name, p.id",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $units = $this->db->raw(
            "SELECT u.id, u.property_id, p.name AS property_name, u.unit_name, u.monthly_rent,
                    u.capacity, u.occupancy_status, u.condition_tag, u.created_at, u.updated_at,
                    t.full_name AS tenant_name, l.status AS lease_status
               FROM units u
               JOIN properties p ON p.id = u.property_id
               LEFT JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
               LEFT JOIN users t ON t.id = l.tenant_id
              WHERE p.owner_id = ? AND u.archived_at IS NULL AND p.archived_at IS NULL
              ORDER BY p.name, u.unit_name, u.id",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $leases = $this->db->raw(
            "SELECT l.id, l.status, l.start_date, l.end_date, l.monthly_rent, l.deposit,
                    l.created_at, l.updated_at, t.full_name AS tenant_name,
                    p.name AS property_name, u.unit_name
               FROM leases l
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = l.tenant_id
              WHERE p.owner_id = ?
              ORDER BY CASE WHEN l.status = 'active' THEN 0 ELSE 1 END, l.end_date DESC, l.id DESC",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $payments = $this->db->raw(
            "SELECT pm.id, pm.amount, pm.method, pm.status, pm.receipt_no, pm.paid_at, pm.created_at,
                    t.full_name AS tenant_name, p.name AS property_name, u.unit_name,
                    b.period_month
               FROM payments pm
               JOIN bills b ON b.id = pm.bill_id
               JOIN leases l ON l.id = b.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = pm.tenant_id
              WHERE p.owner_id = ?
                AND (DATE(pm.created_at) BETWEEN ? AND ?
                     OR (pm.paid_at IS NOT NULL AND DATE(pm.paid_at) BETWEEN ? AND ?))
              ORDER BY COALESCE(pm.paid_at, pm.created_at) DESC, pm.id DESC",
            [$landlord_id, $start, $end, $start, $end]
        )->fetchAll(PDO::FETCH_ASSOC);

        $bills = $this->db->raw(
            "SELECT b.id, b.period_month, b.description, b.amount, b.late_fee_amount,
                    b.due_date, b.status, b.created_at, t.full_name AS tenant_name,
                    p.name AS property_name, u.unit_name
               FROM bills b
               JOIN leases l ON l.id = b.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = b.tenant_id
              WHERE p.owner_id = ? AND DATE(b.created_at) BETWEEN ? AND ?
              ORDER BY b.created_at DESC, b.id DESC",
            $period_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $lease_events = $this->db->raw(
            "SELECT e.id, e.event_type, e.summary, e.created_at, t.full_name AS tenant_name,
                    p.name AS property_name, u.unit_name
               FROM lease_events e
               JOIN leases l ON l.id = e.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = l.tenant_id
              WHERE p.owner_id = ? AND DATE(e.created_at) BETWEEN ? AND ?
              ORDER BY e.created_at DESC, e.id DESC",
            $period_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $transfers = $this->db->raw(
            "SELECT r.id, r.status, r.reason, r.admin_note, r.created_at, r.decided_at,
                    t.full_name AS tenant_name, current_p.name AS current_property,
                    current_u.unit_name AS current_unit, requested_p.name AS requested_property,
                    requested_u.unit_name AS requested_unit
               FROM unit_transfer_requests r
               JOIN users t ON t.id = r.tenant_id
               JOIN units current_u ON current_u.id = r.current_unit_id
               JOIN properties current_p ON current_p.id = current_u.property_id
               JOIN units requested_u ON requested_u.id = r.requested_unit_id
               JOIN properties requested_p ON requested_p.id = requested_u.property_id
              WHERE current_p.owner_id = ? AND requested_p.owner_id = ?
                AND (DATE(r.created_at) BETWEEN ? AND ?
                     OR (r.decided_at IS NOT NULL AND DATE(r.decided_at) BETWEEN ? AND ?))
              ORDER BY r.created_at DESC, r.id DESC",
            [$landlord_id, $landlord_id, $start, $end, $start, $end]
        )->fetchAll(PDO::FETCH_ASSOC);

        $early_move_ins = $this->db->raw(
            "SELECT r.id, r.status, r.requested_start_date, r.reason, r.admin_note,
                    r.created_at, r.decided_at, t.full_name AS tenant_name,
                    p.name AS property_name, u.unit_name
               FROM early_move_in_requests r
               JOIN leases l ON l.id = r.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = r.tenant_id
              WHERE p.owner_id = ?
                AND (DATE(r.created_at) BETWEEN ? AND ?
                     OR (r.decided_at IS NOT NULL AND DATE(r.decided_at) BETWEEN ? AND ?))
              ORDER BY r.created_at DESC, r.id DESC",
            [$landlord_id, $start, $end, $start, $end]
        )->fetchAll(PDO::FETCH_ASSOC);

        $open_bills = $this->db->raw(
            "SELECT b.id, b.period_month, b.amount, b.due_date,
                    CASE WHEN b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE())
                         THEN 'overdue' ELSE b.status END AS status,
                    DATEDIFF(CURDATE(), b.due_date) AS days_late,
                    t.full_name AS tenant_name, p.name AS property_name, u.unit_name
               FROM bills b
               JOIN leases l ON l.id = b.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = b.tenant_id
              WHERE p.owner_id = ? AND b.status IN ('unpaid','overdue')
              ORDER BY b.due_date ASC, b.id ASC",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $open_maintenance = $this->db->raw(
            "SELECT m.id, m.title, m.priority, m.status, m.created_at,
                    t.full_name AS tenant_name, p.name AS property_name, u.unit_name
               FROM maintenance_requests m
               JOIN units u ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = m.tenant_id
              WHERE p.owner_id = ? AND m.status IN ('pending','in_progress')
              ORDER BY FIELD(m.priority, 'high', 'medium', 'low'), m.created_at ASC, m.id ASC",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $maintenance = $this->db->raw(
            "SELECT m.id, m.title, m.priority, m.status, m.created_at, m.updated_at, m.resolved_at,
                    t.full_name AS tenant_name, p.name AS property_name, u.unit_name
               FROM maintenance_requests m
               JOIN units u ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t ON t.id = m.tenant_id
              WHERE p.owner_id = ?
                AND (DATE(m.created_at) BETWEEN ? AND ?
                     OR (m.updated_at IS NOT NULL AND DATE(m.updated_at) BETWEEN ? AND ?)
                     OR (m.resolved_at IS NOT NULL AND DATE(m.resolved_at) BETWEEN ? AND ?))
              ORDER BY COALESCE(m.updated_at, m.created_at) DESC, m.id DESC",
            [$landlord_id, $start, $end, $start, $end, $start, $end]
        )->fetchAll(PDO::FETCH_ASSOC);

        $dashboard = $this->dashboard($landlord_id);
        $collected_in_period = 0.0;
        foreach ($payments as $payment) {
            if ($payment['status'] === 'paid' && !empty($payment['paid_at'])
                && substr($payment['paid_at'], 0, 10) >= $start
                && substr($payment['paid_at'], 0, 10) <= $end) {
                $collected_in_period += (float) $payment['amount'];
            }
        }

        return [
            'period' => [
                'start' => $start,
                'end' => $end,
                'generated_at' => $range['generated_at'],
            ],
            'snapshot' => $dashboard,
            'properties' => $properties,
            'units' => $units,
            'leases' => $leases,
            'activity' => [
                'payments' => $payments,
                'bills' => $bills,
                'lease_events' => $lease_events,
                'transfers' => $transfers,
                'early_move_ins' => $early_move_ins,
                'open_bills' => $open_bills,
                'open_maintenance' => $open_maintenance,
                'maintenance' => $maintenance,
            ],
            'ai_metrics' => [
                'period_start' => $start,
                'period_end' => $end,
                'properties' => (int) $dashboard['properties'],
                'units' => (int) $dashboard['units']['total'],
                'occupied_units' => (int) $dashboard['units']['occupied'],
                'vacant_units' => (int) $dashboard['units']['vacant'],
                'active_leases' => (int) $dashboard['financials']['active_leases_count'],
                'monthly_rent' => (float) $dashboard['financials']['total_monthly_rent'],
                'collected' => round($collected_in_period, 2),
                'payments_count' => count(array_filter($payments, static function ($payment) use ($start, $end) {
                    return $payment['status'] === 'paid' && !empty($payment['paid_at'])
                        && substr($payment['paid_at'], 0, 10) >= $start
                        && substr($payment['paid_at'], 0, 10) <= $end;
                })),
                'bills_created' => count($bills),
                'overdue_bills' => (int) $dashboard['overdue']['count'],
                'lease_events' => count($lease_events),
                'transfer_requests' => count($transfers),
                'early_move_requests' => count($early_move_ins),
                'maintenance_records' => count($maintenance),
                'open_repairs' => (int) $dashboard['open_maintenance'],
                'new_properties' => count(array_filter($properties, static function ($property) use ($start, $end) {
                    return substr($property['created_at'], 0, 10) >= $start
                        && substr($property['created_at'], 0, 10) <= $end;
                })),
                'new_units' => count(array_filter($units, static function ($unit) use ($start, $end) {
                    return substr($unit['created_at'], 0, 10) >= $start
                        && substr($unit['created_at'], 0, 10) <= $end;
                })),
            ],
            'history_note' => 'The system records lease events and dated activity, but does not keep a full before-and-after audit trail for every property, unit, or bill edit. Those sections show current record status and available creation/update dates.',
        ];
    }

    public function landlord_report_summary_metrics($landlord_id)
    {
        $landlord_id = (int) $landlord_id;
        $dashboard = $this->dashboard($landlord_id);
        $row = $this->db->raw(
            "SELECT
                (SELECT COALESCE(SUM(pm.amount), 0)
                   FROM payments pm
                   JOIN bills b ON b.id = pm.bill_id
                   JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND pm.status = 'paid'
                    AND pm.paid_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND pm.paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS collected,
                (SELECT COUNT(*)
                   FROM payments pm
                   JOIN bills b ON b.id = pm.bill_id
                   JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND pm.status = 'paid'
                    AND pm.paid_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND pm.paid_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS payments_count,
                (SELECT COUNT(*) FROM bills b JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND b.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS bills_created,
                (SELECT COUNT(*) FROM lease_events e JOIN leases l ON l.id = e.lease_id
                   JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND e.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND e.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS lease_events,
                (SELECT COUNT(*) FROM unit_transfer_requests r
                   JOIN units current_u ON current_u.id = r.current_unit_id
                   JOIN properties current_p ON current_p.id = current_u.property_id
                   JOIN units requested_u ON requested_u.id = r.requested_unit_id
                   JOIN properties requested_p ON requested_p.id = requested_u.property_id
                  WHERE current_p.owner_id = ? AND requested_p.owner_id = ?
                    AND ((r.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND r.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                         OR (r.decided_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND r.decided_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)))) AS transfer_requests,
                (SELECT COUNT(*) FROM early_move_in_requests r
                   JOIN leases l ON l.id = r.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ?
                    AND ((r.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND r.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                         OR (r.decided_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND r.decided_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)))) AS early_move_requests,
                (SELECT COUNT(*) FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
                   JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ?
                    AND ((m.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND m.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                         OR (m.updated_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND m.updated_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY))
                         OR (m.resolved_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                          AND m.resolved_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)))) AS maintenance_records,
                (SELECT COUNT(*) FROM properties p
                  WHERE p.owner_id = ? AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND p.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS new_properties,
                (SELECT COUNT(*) FROM units u JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND u.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                    AND u.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)) AS new_units",
            array_fill(0, 10, $landlord_id)
        )->fetch(PDO::FETCH_ASSOC);
        $period = $this->db->raw(
            "SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 29 DAY), '%Y-%m-%d') AS period_start,
                    DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS period_end"
        )->fetch(PDO::FETCH_ASSOC);

        return [
            'period_start' => $period['period_start'],
            'period_end' => $period['period_end'],
            'properties' => (int) $dashboard['properties'],
            'units' => (int) $dashboard['units']['total'],
            'occupied_units' => (int) $dashboard['units']['occupied'],
            'vacant_units' => (int) $dashboard['units']['vacant'],
            'active_leases' => (int) $dashboard['financials']['active_leases_count'],
            'monthly_rent' => (float) $dashboard['financials']['total_monthly_rent'],
            'collected' => (float) $row['collected'],
            'payments_count' => (int) $row['payments_count'],
            'bills_created' => (int) $row['bills_created'],
            'overdue_bills' => (int) $dashboard['overdue']['count'],
            'lease_events' => (int) $row['lease_events'],
            'transfer_requests' => (int) $row['transfer_requests'],
            'early_move_requests' => (int) $row['early_move_requests'],
            'maintenance_records' => (int) $row['maintenance_records'],
            'open_repairs' => (int) $dashboard['open_maintenance'],
            'new_properties' => (int) $row['new_properties'],
            'new_units' => (int) $row['new_units'],
        ];
    }
}
