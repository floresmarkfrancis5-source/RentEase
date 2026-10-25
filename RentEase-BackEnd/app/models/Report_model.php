<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Report_model - read-only numbers for the landlord dashboard. */
class Report_model extends Model
{
    protected $table = 'payments';

    public function dashboard($landlord_id = null)
    {
        $db = $this->db;
        $one = function ($sql, $args = []) use ($db) { return $db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC); };

        $overdue_sql = "UPDATE bills SET status = 'overdue' WHERE status = 'unpaid' AND due_date < CURDATE()";
        $overdue_args = [];
        if ($landlord_id !== null) {
            $overdue_sql .= " AND lease_id IN (
                SELECT l.id FROM leases l JOIN units u ON u.id = l.unit_id
                JOIN properties p ON p.id = u.property_id WHERE p.owner_id = ?
            )";
            $overdue_args[] = (int) $landlord_id;
        }
        $db->raw($overdue_sql, $overdue_args);

        $owner = $landlord_id === null ? '' : ' AND p.owner_id = ?';
        $owner_args = $landlord_id === null ? [] : [(int) $landlord_id];
        $collected = $one("SELECT
                COALESCE(SUM(CASE WHEN pm.paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN pm.amount END), 0) AS this_month,
                COALESCE(SUM(pm.amount), 0) AS all_time,
                COUNT(*) AS payments_count
            FROM payments pm JOIN bills b ON b.id = pm.bill_id
            JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
            JOIN properties p ON p.id = u.property_id
            WHERE pm.status = 'paid'" . $owner, $owner_args);

        $bills = $one("SELECT
                COALESCE(SUM(CASE WHEN b.status IN ('unpaid','overdue') THEN b.amount END), 0) AS outstanding,
                COALESCE(SUM(b.status IN ('unpaid','overdue')), 0) AS outstanding_count,
                COALESCE(SUM(CASE WHEN b.status = 'overdue' THEN b.amount END), 0) AS overdue,
                COALESCE(SUM(b.status = 'overdue'), 0) AS overdue_count
            FROM bills b JOIN leases l ON l.id = b.lease_id
            JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
            WHERE 1=1" . $owner, $owner_args);
        $units = $one("SELECT COUNT(*) AS total, COALESCE(SUM(u.occupancy_status='occupied'),0) AS occupied,
                COALESCE(SUM(u.occupancy_status='vacant'),0) AS vacant
            FROM units u JOIN properties p ON p.id = u.property_id WHERE 1=1" . $owner, $owner_args);
        $counts = $one("SELECT
                (SELECT COUNT(*) FROM properties WHERE owner_id = ?) AS properties,
                (SELECT COUNT(*) FROM users WHERE role='tenant' AND is_active=1 AND landlord_id = ?) AS tenants,
                (SELECT COUNT(*) FROM maintenance_requests m JOIN units u ON u.id = m.unit_id JOIN properties p ON p.id = u.property_id
                    WHERE m.status IN ('pending','in_progress') AND p.owner_id = ?) AS open_maintenance",
                [(int) $landlord_id, (int) $landlord_id, (int) $landlord_id]);

        $months = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = date('Y-m', strtotime("first day of -$i month"));
            $months[$m] = ['month' => $m, 'billed' => 0.0, 'collected' => 0.0];
        }
        $monthly_bills = $db->raw("SELECT b.period_month, SUM(b.amount) a FROM bills b
                JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
                JOIN properties p ON p.id = u.property_id
                WHERE b.period_month >= ?" . $owner . " GROUP BY b.period_month", array_merge([array_key_first($months)], $owner_args))->fetchAll(PDO::FETCH_ASSOC);
        foreach ($monthly_bills as $r) {
            if (isset($months[$r['period_month']])) { $months[$r['period_month']]['billed'] = (float) $r['a']; }
        }
        $monthly_payments = $db->raw("SELECT DATE_FORMAT(pm.paid_at,'%Y-%m') m, SUM(pm.amount) a FROM payments pm
                JOIN bills b ON b.id = pm.bill_id JOIN leases l ON l.id = b.lease_id
                JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                WHERE pm.status='paid' AND pm.paid_at >= ?" . $owner . " GROUP BY m",
                array_merge([array_key_first($months) . '-01'], $owner_args))->fetchAll(PDO::FETCH_ASSOC);
        foreach ($monthly_payments as $r) {
            if (isset($months[$r['m']])) { $months[$r['m']]['collected'] = (float) $r['a']; }
        }

        $recent = $db->raw(
            "SELECT pm.id, pm.amount, pm.method, pm.paid_at, pm.receipt_no, t.full_name AS tenant_name, u.unit_name
               FROM payments pm JOIN users t ON t.id = pm.tenant_id JOIN bills b ON b.id = pm.bill_id
               JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE pm.status = 'paid'" . $owner . " ORDER BY pm.paid_at DESC LIMIT 5",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $late = $db->raw(
            "SELECT b.id, b.amount, b.due_date, b.period_month, t.full_name AS tenant_name, u.unit_name,
                    DATEDIFF(CURDATE(), b.due_date) AS days_late
               FROM bills b JOIN users t ON t.id = b.tenant_id JOIN leases l ON l.id = b.lease_id JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE b.status = 'overdue'" . $owner . " ORDER BY b.due_date ASC LIMIT 5",
            $owner_args
        )->fetchAll(PDO::FETCH_ASSOC);

        return [
            'collected'      => ['this_month' => (float) $collected['this_month'], 'all_time' => (float) $collected['all_time'], 'payments_count' => (int) $collected['payments_count']],
            'outstanding'    => ['amount' => (float) $bills['outstanding'], 'count' => (int) $bills['outstanding_count']],
            'overdue'        => ['amount' => (float) $bills['overdue'], 'count' => (int) $bills['overdue_count']],
            'units'          => ['total' => (int) $units['total'], 'occupied' => (int) $units['occupied'], 'vacant' => (int) $units['vacant']],
            'properties'     => (int) $counts['properties'],
            'tenants'        => (int) $counts['tenants'],
            'open_maintenance' => (int) $counts['open_maintenance'],
            'monthly'        => array_values($months),
            'recent_payments' => $recent,
            'overdue_bills'  => $late,
        ];
    }
}
