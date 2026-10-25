<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Bill_model - monthly rent bills (table: bills). Statuses: unpaid, paid, overdue. */
class Bill_model extends Model
{
    protected $table = 'bills';

    private const SELECT = "SELECT b.*, t.full_name AS tenant_name, t.email AS tenant_email,
                    u.unit_name, p.name AS property_name, l.due_day
               FROM bills b
               JOIN leases l     ON l.id = b.lease_id
               JOIN units u      ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t      ON t.id = b.tenant_id";

    /** Unpaid bills whose due date has passed become "overdue" (called before every read). */
    public function mark_overdue()
    {
        return $this->db->raw("UPDATE bills SET status = 'overdue' WHERE status = 'unpaid' AND due_date < CURDATE()")->rowCount();
    }

    public function list_bills(array $f = [])
    {
        $this->mark_overdue();
        $where = [];
        $args  = [];
        if (!empty($f['status']))    { $where[] = 'b.status = ?';       $args[] = $f['status']; }
        if (!empty($f['tenant_id'])) { $where[] = 'b.tenant_id = ?';    $args[] = (int) $f['tenant_id']; }
        if (!empty($f['month']))     { $where[] = 'b.period_month = ?'; $args[] = $f['month']; }
        if (!empty($f['landlord_id'])) { $where[] = 'p.owner_id = ?'; $args[] = (int) $f['landlord_id']; }
        $sql = self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY b.due_date DESC, b.id DESC LIMIT 500';
        return $this->db->raw($sql, $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $landlord_id = null)
    {
        $this->mark_overdue();
        $sql = self::SELECT . ' WHERE b.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Create one bill per active lease for $month (YYYY-MM). Running it twice never duplicates:
     * the UNIQUE(lease_id, period_month) key makes the second INSERT IGNORE a no-op.
     * @return array{created:int, skipped:int, leases:int}
     */
    public function generate_month($month, &$created_bills = null, $landlord_id = null)
    {
        $first = $month . '-01';
        $last  = date('Y-m-t', strtotime($first));
        $label = date('F Y', strtotime($first));
        $days  = (int) date('t', strtotime($first));

        $lease_sql = "SELECT l.id, l.tenant_id, l.monthly_rent, l.due_day, u.unit_name
               FROM leases l JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE l.status = 'active' AND l.start_date <= ? AND (l.end_date IS NULL OR l.end_date >= ?";
        $lease_sql .= ')';
        $lease_args = [$last, $first];
        if ($landlord_id !== null) {
            $lease_sql .= ' AND p.owner_id = ?';
            $lease_args[] = (int) $landlord_id;
        }
        $leases = $this->db->raw(
            $lease_sql,
            $lease_args
        )->fetchAll(PDO::FETCH_ASSOC);

        $created = 0;
        $created_bills = [];
        foreach ($leases as $l) {
            $due = $month . '-' . str_pad((string) min((int) $l['due_day'], $days), 2, '0', STR_PAD_LEFT);
            $insert = $this->db->raw(
                "INSERT IGNORE INTO bills (lease_id, tenant_id, period_month, description, amount, due_date, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'unpaid', NOW())",
                [$l['id'], $l['tenant_id'], $month, "Rent for {$label} - Unit {$l['unit_name']}", $l['monthly_rent'], $due]
            );
            if ($insert->rowCount()) {
                $created++;
                $created_bills[] = [
                    'id' => (int) $this->db->last_id(),
                    'tenant_id' => (int) $l['tenant_id'],
                    'unit_name' => $l['unit_name'],
                    'amount' => (float) $l['monthly_rent'],
                    'period' => $label,
                ];
            }
        }
        $this->mark_overdue();
        return ['created' => $created, 'skipped' => count($leases) - $created, 'leases' => count($leases)];
    }

    public function has_paid_payment($id)
    {
        return (bool) $this->db->table('payments')
            ->select('id')
            ->where('bill_id', (int) $id)
            ->where('status', 'paid')
            ->limit(1)
            ->get();
    }

    public function delete_bill($id)
    {
        $this->db->raw('DELETE FROM payments WHERE bill_id = ? AND status <> \'paid\'', [(int) $id]);
        return $this->db->table($this->table)->where('id', (int) $id)->delete();
    }

    /** Bills that need a reminder: unpaid/overdue and due within $days days (or already late). */
    public function due_soon($days = 3)
    {
        $this->mark_overdue();
        return $this->db->raw(
            self::SELECT . " WHERE b.status IN ('unpaid','overdue') AND b.due_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
                ORDER BY b.due_date", [(int) $days]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function tenant_balance($tenant_id)
    {
        $this->mark_overdue();
        return $this->db->raw(
            "SELECT COALESCE(SUM(amount),0) AS balance,
                    COALESCE(SUM(status='overdue'),0) AS overdue_count,
                    COALESCE(SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END),0) AS overdue_amount
               FROM bills WHERE tenant_id = ? AND status IN ('unpaid','overdue')", [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function next_due($tenant_id)
    {
        $this->mark_overdue();
        return $this->db->raw(
            self::SELECT . " WHERE b.tenant_id = ? AND b.status IN ('unpaid','overdue') ORDER BY b.due_date ASC LIMIT 1", [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }
}
