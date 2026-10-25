<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Lease_model - who rents which unit, for how much and on which due day (table: leases). */
class Lease_model extends Model
{
    protected $table = 'leases';

    private const SELECT = "SELECT l.*, u.unit_name, u.property_id, p.owner_id AS landlord_id, p.name AS property_name, p.address,
                    p.city AS property_city, p.barangay AS property_barangay,
                    t.full_name AS tenant_name, t.email AS tenant_email, t.phone AS tenant_phone
               FROM leases l
               JOIN units u      ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
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

    public function unit_has_active_lease($unit_id)
    {
        return (bool) $this->db->table($this->table)
            ->select('id')
            ->where('unit_id', (int) $unit_id)
            ->where('status', 'active')
            ->limit(1)
            ->get();
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
        $this->db->table($this->table)->insert([
            'unit_id'      => (int) $d['unit_id'],
            'tenant_id'    => (int) $d['tenant_id'],
            'start_date'   => $d['start_date'],
            'end_date'     => $d['end_date'] ?? null,
            'monthly_rent' => $d['monthly_rent'],
            'deposit'      => $d['deposit'] ?? 0,
            'due_day'      => (int) ($d['due_day'] ?? 5),
            'status'       => 'active',
            'created_at'   => date('Y-m-d H:i:s'),
        ]);
        $id = (int) $this->db->last_id();
        $this->db->raw("UPDATE units SET occupancy_status = 'occupied' WHERE id = ?", [(int) $d['unit_id']]);
        $this->record_event($id, 'created', 'Lease created.', null, $this->lease_snapshot(array_merge($d, ['status' => 'active'])), $actor_id);
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
            'unit_id'      => $unit['id'],
            'tenant_id'    => $lease['tenant_id'],
            'start_date'   => $today,
            'monthly_rent' => $unit['monthly_rent'],
            'deposit'      => $lease['deposit'],
            'due_day'      => $lease['due_day'],
        ], $actor_id);
    }

    public function update_lease($id, array $d, $actor_id = null)
    {
        $allowed = array_intersect_key($d, array_flip(['monthly_rent', 'deposit', 'due_day', 'end_date']));
        if (!$allowed) {
            return false;
        }
        $this->db->transaction();
        try {
            $current = $this->db->raw('SELECT * FROM leases WHERE id = ? FOR UPDATE', [(int) $id])->fetch(PDO::FETCH_ASSOC);
            if (!$current || $current['status'] !== 'active') {
                $this->db->roll_back();
                return false;
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
            $before = $this->lease_snapshot($current);
            $after = array_merge($before, array_intersect_key($d, array_flip(['end_date', 'monthly_rent', 'deposit', 'due_day'])));
            $after['status'] = 'active';
            $after['unit_id'] = (int) $current['unit_id'];
            $after['tenant_id'] = (int) $current['tenant_id'];
            $after['start_date'] = $current['start_date'];
            $after['monthly_rent'] = number_format((float) $after['monthly_rent'], 2, '.', '');
            $after['deposit'] = number_format((float) $after['deposit'], 2, '.', '');
            $after['due_day'] = (int) $after['due_day'];
            $this->db->table($this->table)->where('id', (int) $id)->update([
                'end_date' => $after['end_date'],
                'monthly_rent' => $after['monthly_rent'],
                'deposit' => $after['deposit'],
                'due_day' => $after['due_day'],
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
            $this->record_event((int) $id, 'renewed', 'Lease term renewed or extended.', $before, $after, $actor_id);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
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
        $fields = ['unit_id', 'tenant_id', 'start_date', 'end_date', 'monthly_rent', 'deposit', 'due_day', 'status'];
        $snapshot = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $lease)) {
                $snapshot[$field] = $lease[$field];
            }
        }
        return $snapshot;
    }

    private function record_event($lease_id, $type, $summary, $before, $after, $actor_id = null)
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
