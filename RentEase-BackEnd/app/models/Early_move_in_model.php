<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Tenant requests to move in before the scheduled start date of an accepted lease. */
class Early_move_in_model extends Model
{
    protected $table = 'early_move_in_requests';

    private const SELECT = "SELECT r.*, t.full_name AS tenant_name, t.email AS tenant_email,
                    l.start_date AS scheduled_start_date, l.end_date, l.monthly_rent,
                    l.due_day, l.billing_style, l.prorate_first_month, l.grace_period_days, l.late_fee,
                    u.unit_name, p.name AS property_name, p.owner_id AS landlord_id,
                    d.full_name AS decided_by_name
               FROM early_move_in_requests r
               JOIN leases l ON l.id = r.lease_id
               JOIN users t ON t.id = r.tenant_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
          LEFT JOIN users d ON d.id = r.decided_by";

    public function list_for_landlord($landlord_id)
    {
        $this->expire_stale_requests();
        return $this->db->raw(
            self::SELECT . ' WHERE p.owner_id = ? ORDER BY FIELD(r.status,\'pending\',\'approved\',\'rejected\',\'cancelled\',\'expired\'), r.created_at DESC LIMIT 500',
            [(int) $landlord_id]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function list_for_tenant($tenant_id)
    {
        $this->expire_stale_requests();
        return $this->db->raw(
            self::SELECT . ' WHERE r.tenant_id = ? ORDER BY r.created_at DESC LIMIT 50',
            [(int) $tenant_id]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    private function expire_stale_requests()
    {
        $this->db->raw(
            "UPDATE early_move_in_requests r
              JOIN leases l ON l.id = r.lease_id
                SET r.status = 'expired', r.decided_at = NOW()
              WHERE r.status = 'pending'
                AND (r.requested_start_date < CURDATE() OR l.start_date <= CURDATE())"
        );
    }

    public function has_pending($tenant_id)
    {
        return (bool) $this->db->raw(
            "SELECT 1 FROM {$this->table} WHERE tenant_id = ? AND status = 'pending' LIMIT 1",
            [(int) $tenant_id]
        )->fetchColumn();
    }

    public function create_request($lease, $tenant_id, $start_date, $reason)
    {
        $this->db->table($this->table)->insert([
            'lease_id' => (int) $lease['id'],
            'tenant_id' => (int) $tenant_id,
            'requested_start_date' => $start_date,
            'reason' => $reason,
            'tenant_acknowledged_at' => date('Y-m-d H:i:s'),
            'status' => 'pending',
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function find($id, $landlord_id = null, $tenant_id = null, $lock = false)
    {
        $sql = self::SELECT . ' WHERE r.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        if ($tenant_id !== null) {
            $sql .= ' AND r.tenant_id = ?';
            $args[] = (int) $tenant_id;
        }
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function decide_transactionally($id, $status, $note, $landlord_id, Lease_model $lease_model)
    {
        $this->db->transaction();
        try {
            $request = $this->find($id, $landlord_id, null, true);
            if (!$request) {
                $this->db->roll_back();
                return ['error' => 'not_found'];
            }
            if ($request['status'] !== 'pending') {
                $this->db->roll_back();
                return ['error' => 'already_decided'];
            }

            if ($status === 'approved') {
                $lease = $this->db->raw(
                    'SELECT * FROM leases WHERE id = ? AND tenant_id = ? FOR UPDATE',
                    [(int) $request['lease_id'], (int) $request['tenant_id']]
                )->fetch(PDO::FETCH_ASSOC);
                if (!$lease || $lease['status'] !== 'scheduled' || $lease['start_date'] <= $request['requested_start_date']) {
                    $this->db->roll_back();
                    return ['error' => 'lease_changed'];
                }
                if ($request['requested_start_date'] < date('Y-m-d') || ($lease['end_date'] && $request['requested_start_date'] > $lease['end_date'])) {
                    $this->db->roll_back();
                    return ['error' => 'date_unavailable'];
                }
                $lease_model->early_start_in_transaction($lease, $request['requested_start_date'], $landlord_id);
            }

            $this->db->table($this->table)->where('id', (int) $id)->update([
                'status' => $status,
                'admin_note' => $note,
                'decided_by' => (int) $landlord_id,
                'decided_at' => date('Y-m-d H:i:s'),
            ]);
            $this->db->commit();
            return ['request' => $this->find($id, $landlord_id)];
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function cancel_pending($id, $tenant_id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where('tenant_id', (int) $tenant_id)
            ->where('status', 'pending')
            ->update(['status' => 'cancelled']) > 0;
    }

    public function delete_request($id, $landlord_id = null, $tenant_id = null)
    {
        $request = $this->find($id, $landlord_id, $tenant_id);
        if (!$request) {
            return false;
        }
        return $this->db->table($this->table)->where('id', (int) $id)->delete() > 0;
    }
}
