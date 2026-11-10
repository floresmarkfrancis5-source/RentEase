<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Maintenance_model - repair requests from tenants (table: maintenance_requests). */
class Maintenance_model extends Model
{
    protected $table = 'maintenance_requests';

    private const SELECT = "SELECT m.*, t.full_name AS tenant_name, t.email AS tenant_email, u.unit_name, p.name AS property_name, p.owner_id AS landlord_id
               FROM maintenance_requests m
               JOIN users t      ON t.id = m.tenant_id
               JOIN units u      ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id";

    public function list_requests(array $f = [])
    {
        $where = [];
        $args  = [];
        if (!empty($f['tenant_id'])) { $where[] = 'm.tenant_id = ?'; $args[] = (int) $f['tenant_id']; }
        if (!empty($f['status']))    { $where[] = 'm.status = ?';    $args[] = $f['status']; }
        if (!empty($f['landlord_id'])) { $where[] = 'p.owner_id = ?'; $args[] = (int) $f['landlord_id']; }
        $sql = self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . " ORDER BY FIELD(m.status,'pending','in_progress','resolved'), FIELD(m.priority,'high','medium','low'), m.id DESC LIMIT 500";
        return $this->db->raw($sql, $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $landlord_id = null)
    {
        $sql = self::SELECT . ' WHERE m.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function create_request(array $d)
    {
        $this->db->table($this->table)->insert([
            'tenant_id'   => (int) $d['tenant_id'],
            'unit_id'     => (int) $d['unit_id'],
            'title'       => $d['title'],
            'category'    => $d['category'],
            'description' => $d['description'],
            'priority'    => $d['priority'],
            'status'      => 'pending',
            'created_at'  => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function update_request($id, array $d)
    {
        $set = array_intersect_key($d, array_flip(['status', 'admin_notes']));
        if (!$set) {
            return 0;
        }
        $set['updated_at'] = date('Y-m-d H:i:s');
        if (isset($set['status'])) {
            $set['resolved_at'] = $set['status'] === 'resolved' ? date('Y-m-d H:i:s') : null;
        }
        return $this->db->table($this->table)->where('id', (int) $id)->update($set);
    }

    public function delete_request($id, $tenant_id = null, $landlord_id = null)
    {
        $req = $this->find($id, $landlord_id);
        if (!$req) {
            return false;
        }
        if ($tenant_id !== null && (int) $req['tenant_id'] !== (int) $tenant_id) {
            return false;
        }
        $this->db->table('maintenance_images')->where('request_id', (int) $id)->delete();
        return (bool) $this->db->table($this->table)->where('id', (int) $id)->delete();
    }
}
