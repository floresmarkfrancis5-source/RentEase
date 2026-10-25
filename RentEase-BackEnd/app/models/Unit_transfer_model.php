<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Unit_transfer_model - tenant requests to move to another unit. */
class Unit_transfer_model extends Model
{
    protected $table = 'unit_transfer_requests';

    private const SELECT = "SELECT r.*, t.full_name AS tenant_name,
                    cu.unit_name AS current_unit_name, cp.name AS current_property_name,
                    ru.unit_name AS requested_unit_name, rp.name AS requested_property_name,
                    d.full_name AS decided_by_name
               FROM unit_transfer_requests r
               JOIN users t ON t.id = r.tenant_id
               JOIN units cu ON cu.id = r.current_unit_id
               JOIN properties cp ON cp.id = cu.property_id
               JOIN units ru ON ru.id = r.requested_unit_id
               JOIN properties rp ON rp.id = ru.property_id
          LEFT JOIN users d ON d.id = r.decided_by";

    public function list_requests($tenant_id = null, $landlord_id = null)
    {
        $where = [];
        $args = [];
        if ($tenant_id !== null) {
            $where[] = 'r.tenant_id = ?';
            $args[] = (int) $tenant_id;
        }
        if ($landlord_id !== null) {
            $where[] = 'cp.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw(self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY FIELD(r.status,'pending','approved','rejected'), r.created_at DESC LIMIT 500", $args)
            ->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $lock = false, $landlord_id = null)
    {
        $sql = self::SELECT . ' WHERE r.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND cp.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function has_pending($tenant_id)
    {
        return (bool) $this->db->raw(
            "SELECT 1 FROM unit_transfer_requests WHERE tenant_id = ? AND status = 'pending' LIMIT 1",
            [(int) $tenant_id]
        )->fetchColumn();
    }

    public function create_request($tenant_id, $current_unit_id, $requested_unit_id, $reason)
    {
        $this->db->table($this->table)->insert([
            'tenant_id' => (int) $tenant_id,
            'current_unit_id' => (int) $current_unit_id,
            'requested_unit_id' => (int) $requested_unit_id,
            'reason' => $reason,
            'status' => 'pending',
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function decide($id, $status, $note, $admin_id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->update([
            'status' => $status,
            'admin_note' => $note,
            'decided_by' => (int) $admin_id,
            'decided_at' => date('Y-m-d H:i:s'),
        ]);
    }
}
