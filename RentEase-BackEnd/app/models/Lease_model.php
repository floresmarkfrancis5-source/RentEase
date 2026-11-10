<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Lease_model - who rents which unit, for how much and on which due day (table: leases). */
class Lease_model extends Model
{
    protected $table = 'leases';

    private const SELECT = "SELECT l.*, u.unit_name, u.property_id, p.owner_id AS landlord_id, p.name AS property_name, p.address,
                    p.city AS property_city, p.barangay AS property_barangay, landlord.full_name AS landlord_name,
                    t.full_name AS tenant_name, t.email AS tenant_email, t.phone AS tenant_phone
               FROM leases l
               JOIN units u      ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users landlord ON landlord.id = p.owner_id
               JOIN users t      ON t.id = l.tenant_id";

    public function list_leases($status = null, $landlord_id = null)
    {
        $where = [];
        $args = [];
        if ($status) {
            $where[] = 'l.status = ?';
            $args[] = $status;
        }
        if ($landlord_id !== null) {
            $where[] = 'p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw(self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY l.status, l.id DESC', $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function sync_lifecycle()
    {
        $this->db->raw("UPDATE leases SET status = 'expired', updated_at = NOW()
                         WHERE status = 'offered' AND start_date <= CURDATE()");
        $this->db->raw("UPDATE leases SET status = 'active', updated_at = NOW()
                         WHERE status = 'scheduled' AND start_date <= CURDATE()");
        $this->db->raw("UPDATE units u JOIN leases l ON l.unit_id = u.id
                         SET u.occupancy_status = 'occupied'
                         WHERE l.status = 'active' AND l.start_date <= CURDATE()");
    }

    public function offers_for_tenant($tenant_id)
    {
        return $this->db->raw(
            self::SELECT . " WHERE l.tenant_id = ? AND l.status = 'offered' ORDER BY l.start_date, l.id",
            [(int) $tenant_id]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function expired_offers_for_tenant($tenant_id)
    {
        return $this->db->raw(
            self::SELECT . " WHERE l.tenant_id = ? AND l.status = 'expired' AND l.contract_required = 1
                 ORDER BY l.start_date DESC LIMIT 5",
            [(int) $tenant_id]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function scheduled_for_tenant($tenant_id)
    {
        return $this->db->raw(
            self::SELECT . " WHERE l.tenant_id = ? AND l.status = 'scheduled' ORDER BY l.start_date LIMIT 1",
            [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function cancel_offer($id, $landlord_id)
    {
        return $this->db->raw(
            "UPDATE leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                SET l.status = 'cancelled', l.updated_at = NOW()
              WHERE l.id = ? AND p.owner_id = ? AND l.status IN ('offered','scheduled')",
            [(int) $id, (int) $landlord_id]
        )->rowCount() > 0;
    }

    public function find_for_tenant($id, $tenant_id)
    {
        return $this->db->raw(
            self::SELECT . ' WHERE l.id = ? AND l.tenant_id = ?',
            [(int) $id, (int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function accept_offer($id, $tenant_id)
    {
        $this->db->transaction();
        try {
            $lease = $this->db->raw(
                'SELECT * FROM leases WHERE id = ? AND tenant_id = ? FOR UPDATE',
                [(int) $id, (int) $tenant_id]
            )->fetch(PDO::FETCH_ASSOC);
            if (!$lease || $lease['status'] !== 'offered') {
                $this->db->roll_back();
                return 'unavailable';
            }

            if ($lease['start_date'] <= date('Y-m-d')) {
                $this->db->raw(
                    "UPDATE leases SET status = 'expired', updated_at = NOW() WHERE id = ?",
                    [(int) $id]
                );
                $this->db->commit();
                return 'expired';
            }

            $this->db->raw('SELECT id FROM users WHERE id = ? FOR UPDATE', [(int) $tenant_id])->fetch(PDO::FETCH_ASSOC);
            $this->db->raw('SELECT id FROM units WHERE id = ? FOR UPDATE', [(int) $lease['unit_id']])->fetch(PDO::FETCH_ASSOC);
            $reserved = $this->db->raw(
                "SELECT id FROM leases
                  WHERE id <> ? AND status IN ('scheduled','active')
                    AND (unit_id = ? OR tenant_id = ?) LIMIT 1",
                [(int) $id, (int) $lease['unit_id'], (int) $tenant_id]
            )->fetch(PDO::FETCH_ASSOC);
            if ($reserved) {
                $this->db->roll_back();
                return 'conflict';
            }

            $status = $lease['start_date'] <= date('Y-m-d') ? 'active' : 'scheduled';
            $this->db->raw(
                'UPDATE leases SET status = ?, tenant_accepted_at = NOW(), updated_at = NOW() WHERE id = ?',
                [$status, (int) $id]
            );
            if ($status === 'active') {
                $this->db->raw("UPDATE units SET occupancy_status = 'occupied' WHERE id = ?", [(int) $lease['unit_id']]);
            }
            $this->record_event((int) $id, 'tenant_accepted', 'Tenant accepted the lease contract.', null, [
                'status' => $status,
                'tenant_accepted_at' => date('Y-m-d H:i:s'),
            ], $tenant_id);
            $this->db->commit();
            return $status;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    /** Apply an approved early start while preserving the original lease end date. */
    public function early_start_in_transaction(array $lease, $start_date, $actor_id)
    {
        $newStatus = $start_date <= date('Y-m-d') ? 'active' : 'scheduled';
        $before = $this->lease_snapshot($lease);
        $this->db->table($this->table)->where('id', (int) $lease['id'])->update([
            'start_date' => $start_date,
            'status' => $newStatus,
            'updated_at' => date('Y-m-d H:i:s'),
        ]);
        if ($newStatus === 'active') {
            $this->db->raw("UPDATE units SET occupancy_status = 'occupied' WHERE id = ?", [(int) $lease['unit_id']]);
        }
        $after = array_merge($before, ['start_date' => $start_date, 'status' => $newStatus]);
        $this->record_event(
            (int) $lease['id'],
            'early_move_in_approved',
            'Landlord approved the tenant’s early move-in request. The original lease end date and billing terms were preserved.',
            $before,
            $after,
            $actor_id
        );
    }

    public function find($id, $landlord_id = null)
    {
        $sql = self::SELECT . ' WHERE l.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function active_for_tenant($tenant_id)
    {
        return $this->db->raw(
            self::SELECT . " WHERE l.tenant_id = ? AND l.status = 'active' ORDER BY l.id DESC LIMIT 1", [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function active_for_tenant_for_update($tenant_id)
    {
        return $this->db->raw(
            "SELECT * FROM leases WHERE tenant_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function unit_has_active_lease($unit_id)
    {
        return (bool) $this->db->raw(
            "SELECT id FROM leases WHERE unit_id = ? AND status IN ('active','scheduled') LIMIT 1",
            [(int) $unit_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function tenant_has_current_lease($tenant_id)
    {
        return (bool) $this->db->raw(
            'SELECT id FROM leases WHERE current_tenant_id = ? LIMIT 1',
            [(int) $tenant_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function create_lease(array $d)
    {
        $this->db->transaction();
        try {
            $id = $this->create_lease_in_transaction($d);
            $this->db->commit();
            return $id;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    /** Insert a lease while the caller owns the surrounding transaction. */
    public function create_lease_in_transaction(array $d, $actor_id = null)
    {
        $term      = !empty($d['contract_term']) ? $d['contract_term'] : 'monthly';
        $months    = isset($d['contract_months']) ? (int) $d['contract_months'] : ($term === 'annually' ? 12 : null);
        $advance   = isset($d['advance_payment']) ? (float) $d['advance_payment'] : 0.00;
        $down      = isset($d['down_payment']) ? (float) $d['down_payment'] : 0.00;
        $monthly   = (float) $d['monthly_rent'];
        $lateFee   = (float) ($d['late_fee'] ?? 0);
        $graceDays = (int) ($d['grace_period_days'] ?? 3);
        if ($lateFee < 0 || $lateFee > $monthly) {
            throw new InvalidArgumentException('The late fee cannot exceed one month of rent.');
        }
        if ($graceDays < 0 || $graceDays > 15) {
            throw new InvalidArgumentException('The grace period must be between 0 and 15 days.');
        }
        $estAnnual = isset($d['estimated_annual_income']) && $d['estimated_annual_income'] !== null && $d['estimated_annual_income'] !== ''
            ? (float) $d['estimated_annual_income']
            : ($monthly * 12);
        $status = $d['status'] ?? (!empty($d['contract_required'])
            ? 'offered'
            : ($d['start_date'] > date('Y-m-d') ? 'scheduled' : 'active'));
        $billingStyle = $d['billing_style'] ?? 'calendar';
        $dueDay = (int) ($d['due_day'] ?? 1);
        if ($billingStyle === 'anniversary') {
            $startDay = (int) (new DateTimeImmutable($d['start_date']))->format('j');
            if ($startDay > 28) {
                throw new InvalidArgumentException('Anniversary billing requires a lease start date on or before the 28th.');
            }
            $dueDay = $startDay;
        } elseif ($billingStyle === 'first_of_month') {
            if ((new DateTimeImmutable($d['start_date']))->format('j') !== '1') {
                throw new InvalidArgumentException('This landlord requires leases to start on the first day of a month.');
            }
            $dueDay = 1;
        } elseif (!in_array($billingStyle, ['calendar', 'anniversary', 'first_of_month'], true)) {
            throw new InvalidArgumentException('Unknown billing schedule.');
        }
        $endDate = $d['end_date'] ?? null;
        if ($term === 'annually') {
            $endDate = (new DateTimeImmutable($d['start_date']))
                ->modify('+1 year')
                ->modify('-1 day')
                ->format('Y-m-d');
        }

        $this->db->table($this->table)->insert([
            'unit_id'                 => (int) $d['unit_id'],
            'tenant_id'               => (int) $d['tenant_id'],
            'start_date'              => $d['start_date'],
            'end_date'                => $endDate,
            'monthly_rent'            => $monthly,
            'deposit'                 => $d['deposit'] ?? 0,
            'due_day'                 => $dueDay,
            'billing_style'           => $billingStyle,
            'prorate_first_month'     => !empty($d['prorate_first_month']) ? 1 : 0,
            'grace_period_days'       => $graceDays,
            'late_fee'                => $lateFee,
            'contract_term'           => $term,
            'contract_months'         => $months,
            'advance_payment'         => $advance,
            'down_payment'            => $down,
            'estimated_annual_income' => $estAnnual,
            'contract_required'       => !empty($d['contract_required']) ? 1 : 0,
            'contract_json'           => $d['contract_json'] ?? null,
            'tenant_accepted_at'      => null,
            'notes'                   => isset($d['notes']) && $d['notes'] !== '' ? (string) $d['notes'] : null,
            'status'                  => $status,
            'created_at'              => date('Y-m-d H:i:s'),
        ]);
        $id = (int) $this->db->last_id();
        if ($status === 'active') {
            $this->db->raw("UPDATE units SET occupancy_status = 'occupied' WHERE id = ?", [(int) $d['unit_id']]);
        }
        $this->record_event($id, 'created', $status === 'offered' ? 'Lease contract offered to tenant.' : 'Lease created.', null, $this->lease_snapshot(array_merge($d, ['status' => $status])), $actor_id);
        if ($actor_id !== null) {
            $this->db->table('in_app_notifications')->insert([
                'user_id' => (int) $actor_id,
                'type' => 'new_lease',
                'title' => 'New lease',
                'message' => $status === 'offered'
                    ? 'A new lease contract was sent for tenant approval.'
                    : 'A new lease was created.',
                'related_id' => $id,
                'is_read' => 0,
                'created_at' => date('Y-m-d H:i:s'),
            ]);
        }
        return $id;
    }

    /** Move an active lease without changing its billing history. Caller owns the transaction. */
    public function transfer_active_lease_in_transaction(array $lease, array $unit, $actor_id = null)
    {
        $today = date('Y-m-d');
        $this->db->raw(
            "UPDATE leases SET status = 'ended', end_date = ?, updated_at = NOW()
              WHERE id = ? AND status = 'active'",
            [$today, (int) $lease['id']]
        );
        $this->record_event((int) $lease['id'], 'ended', 'Lease ended as part of a unit transfer.', $this->lease_snapshot($lease), [
            'status' => 'ended',
            'end_date' => $today,
        ], $actor_id);
        $this->db->raw("UPDATE units SET occupancy_status = 'vacant' WHERE id = ?", [(int) $lease['unit_id']]);
        return $this->create_lease_in_transaction([
            'unit_id'                 => $unit['id'],
            'tenant_id'               => $lease['tenant_id'],
            'start_date'              => $today,
            'monthly_rent'            => $unit['monthly_rent'],
            'deposit'                 => $lease['deposit'],
            'due_day'                 => $lease['due_day'],
            'billing_style'           => $lease['billing_style'] ?? 'calendar',
            'prorate_first_month'     => $lease['prorate_first_month'] ?? 0,
            'grace_period_days'       => $lease['grace_period_days'] ?? 3,
            'late_fee'                => $lease['late_fee'] ?? 0,
            'contract_term'           => $lease['contract_term'] ?? 'monthly',
            'contract_months'         => $lease['contract_months'] ?? null,
            'advance_payment'         => $lease['advance_payment'] ?? 0,
            'down_payment'            => $lease['down_payment'] ?? 0,
            'estimated_annual_income' => ((float) $unit['monthly_rent']) * 12,
        ], $actor_id);
    }

    public function update_lease($id, array $d, $actor_id = null)
    {
        $allowed = array_intersect_key($d, array_flip([
            'monthly_rent', 'deposit', 'due_day', 'end_date', 'notes',
            'contract_term', 'contract_months', 'advance_payment', 'down_payment', 'estimated_annual_income',
            'billing_style', 'prorate_first_month', 'grace_period_days', 'late_fee'
        ]));
        // Normalise notes: empty string → null
        if (array_key_exists('notes', $allowed)) {
            $allowed['notes'] = ($allowed['notes'] !== '' && $allowed['notes'] !== null) ? (string) $allowed['notes'] : null;
        }
        if (isset($allowed['monthly_rent']) && !isset($allowed['estimated_annual_income'])) {
            $allowed['estimated_annual_income'] = ((float) $allowed['monthly_rent']) * 12;
        }
        if (empty($allowed)) {
            return false;
        }
        $this->db->transaction();
        try {
            $current = $this->db->raw('SELECT * FROM leases WHERE id = ? FOR UPDATE', [(int) $id])->fetch(PDO::FETCH_ASSOC);
            if (!$current || $current['status'] !== 'active') {
                $this->db->roll_back();
                return false;
            }
            if ((float) ($allowed['late_fee'] ?? $current['late_fee']) > (float) ($allowed['monthly_rent'] ?? $current['monthly_rent'])) {
                $this->db->roll_back();
                return false;
            }
            $billingStyle = $allowed['billing_style'] ?? $current['billing_style'];
            if ($billingStyle === 'anniversary') {
                $startDay = (int) (new DateTimeImmutable($current['start_date']))->format('j');
                if ($startDay > 28) {
                    $this->db->roll_back();
                    return false;
                }
                $allowed['due_day'] = $startDay;
            } elseif ($billingStyle === 'first_of_month') {
                if ((new DateTimeImmutable($current['start_date']))->format('j') !== '1') {
                    $this->db->roll_back();
                    return false;
                }
                $allowed['due_day'] = 1;
                $allowed['prorate_first_month'] = 0;
            }
            $before = $this->lease_snapshot($current);
            $after = array_merge($before, $allowed);
            if ($before !== $after) {
                $allowed['updated_at'] = date('Y-m-d H:i:s');
                $this->db->table($this->table)->where('id', (int) $id)->update($allowed);
                $this->record_event((int) $id, 'terms_updated', 'Lease terms updated.', $before, $after, $actor_id);
            }
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function renew_lease($id, array $d, $actor_id = null)
    {
        $this->db->transaction();
        try {
            $current = $this->db->raw('SELECT * FROM leases WHERE id = ? FOR UPDATE', [(int) $id])->fetch(PDO::FETCH_ASSOC);
            if (!$current || $current['status'] !== 'active') {
                $this->db->roll_back();
                return false;
            }
            $minimum_date = $current['end_date'] ?: date('Y-m-d');
            if ($d['end_date'] <= $minimum_date) {
                $this->db->roll_back();
                return false;
            }
            if ((float) $current['late_fee'] > (float) ($d['monthly_rent'] ?? $current['monthly_rent'])) {
                $this->db->roll_back();
                return false;
            }
            $before = $this->lease_snapshot($current);
            $after = array_merge($before, array_intersect_key($d, array_flip([
                'end_date', 'monthly_rent', 'deposit', 'due_day',
                'contract_term', 'contract_months', 'advance_payment', 'down_payment', 'estimated_annual_income'
            ])));
            $after['status'] = 'active';
            $after['unit_id'] = (int) $current['unit_id'];
            $after['tenant_id'] = (int) $current['tenant_id'];
            $after['start_date'] = $current['start_date'];
            $after['monthly_rent'] = number_format((float) $after['monthly_rent'], 2, '.', '');
            $after['deposit'] = number_format((float) $after['deposit'], 2, '.', '');
            $after['due_day'] = (int) $after['due_day'];
            $estAnnual = isset($after['estimated_annual_income']) ? (float) $after['estimated_annual_income'] : (((float) $after['monthly_rent']) * 12);
            $this->db->table($this->table)->where('id', (int) $id)->update([
                'end_date'                => $after['end_date'],
                'monthly_rent'            => $after['monthly_rent'],
                'deposit'                 => $after['deposit'],
                'due_day'                 => $after['due_day'],
                'contract_term'           => $after['contract_term'] ?? 'monthly',
                'contract_months'         => $after['contract_months'] ?? 12,
                'advance_payment'         => $after['advance_payment'] ?? 0,
                'down_payment'            => $after['down_payment'] ?? 0,
                'estimated_annual_income' => $estAnnual,
                'updated_at'              => date('Y-m-d H:i:s'),
            ]);
            $this->record_event((int) $id, 'renewed', 'Lease term renewed or extended.', $before, $after, $actor_id);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function financial_summary($landlord_id = null)
    {
        $where = ["l.status = 'active'"];
        $args = [];
        if ($landlord_id !== null) {
            $where[] = 'p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        $sql = "SELECT 
                    COUNT(l.id) AS active_leases_count,
                    COALESCE(SUM(l.monthly_rent), 0) AS total_monthly_rent,
                    COALESCE(SUM(COALESCE(l.estimated_annual_income, l.monthly_rent * 12)), 0) AS estimated_annual_income,
                    COALESCE(SUM(l.deposit), 0) AS total_deposits,
                    COALESCE(SUM(l.advance_payment), 0) AS total_advances,
                    COALESCE(SUM(l.down_payment), 0) AS total_down_payments
                FROM leases l
                JOIN units u ON u.id = l.unit_id
                JOIN properties p ON p.id = u.property_id
                WHERE " . implode(' AND ', $where);
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function history($id)
    {
        return $this->db->table('lease_events')
            ->select('id, actor_id, event_type, summary, before_data, after_data, created_at')
            ->where('lease_id', (int) $id)
            ->order_by('created_at', 'DESC')
            ->get_all(PDO::FETCH_ASSOC);
    }

    private function lease_snapshot(array $lease)
    {
        $fields = [
            'unit_id', 'tenant_id', 'start_date', 'end_date', 'monthly_rent', 'deposit', 'due_day',
            'billing_style', 'prorate_first_month', 'grace_period_days', 'late_fee', 'status',
        ];
        $snapshot = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $lease)) {
                $snapshot[$field] = $lease[$field];
            }
        }
        return $snapshot;
    }

    public function record_event($lease_id, $type, $summary, $before, $after, $actor_id = null)
    {
        $this->db->table('lease_events')->insert([
            'lease_id' => (int) $lease_id,
            'actor_id' => $actor_id ? (int) $actor_id : null,
            'event_type' => $type,
            'summary' => $summary,
            'before_data' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
            'after_data' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /** End a lease and free the unit. */
    public function end_lease($id, $end_date, $actor_id = null)
    {
        $this->db->transaction();
        try {
            $lease = $this->db->raw('SELECT * FROM leases WHERE id = ? FOR UPDATE', [(int) $id])->fetch(PDO::FETCH_ASSOC);
            if (!$lease || $lease['status'] !== 'active') {
                $this->db->roll_back();
                return false;
            }
            $before = $this->lease_snapshot($lease);
            $this->db->raw(
                "UPDATE leases SET status = 'ended', end_date = ?, updated_at = NOW()
                  WHERE id = ? AND status = 'active'",
                [$end_date, (int) $id]
            );
            $this->db->raw("UPDATE units SET occupancy_status = CASE WHEN EXISTS (
                SELECT 1 FROM leases WHERE unit_id = ? AND status = 'active'
            ) THEN 'occupied' ELSE 'vacant' END WHERE id = ?", [(int) $lease['unit_id'], (int) $lease['unit_id']]);
            $this->record_event((int) $id, 'ended', 'Lease ended.', $before, [
                'status' => 'ended',
                'end_date' => $end_date,
            ], $actor_id);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function has_bills($id)
    {
        return (bool) $this->db->table('bills')->select('id')->where('lease_id', (int) $id)->limit(1)->get();
    }

    public function delete_lease($id)
    {
        $lease = $this->find($id);
        $this->db->table($this->table)->where('id', (int) $id)->delete();
        if ($lease && $lease['status'] === 'active') {
            $this->db->raw("UPDATE units SET occupancy_status = CASE WHEN EXISTS (
                SELECT 1 FROM leases WHERE unit_id = ? AND status = 'active'
            ) THEN 'occupied' ELSE 'vacant' END WHERE id = ?", [(int) $lease['unit_id'], (int) $lease['unit_id']]);
        }
    }
}
