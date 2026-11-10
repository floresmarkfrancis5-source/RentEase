<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Property_model - apartments / boarding houses (table: properties). */
class Property_model extends Model
{
    protected $table = 'properties';

    public function all_with_counts($owner_id = null)
    {
        $sql = "SELECT p.*,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS units_count,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.occupancy_status = 'occupied') AS occupied_count
               FROM properties p";
        $args = [];
        if ($owner_id !== null) {
            $sql .= ' WHERE p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw(
            $sql . ' ORDER BY p.name', $args
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $owner_id = null)
    {
        $sql = "SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) AS units_count,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.occupancy_status = 'occupied') AS occupied_count
               FROM properties p WHERE p.id = ?";
        $args = [(int) $id];
        if ($owner_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function create_property(array $d, $owner_id)
    {
        $this->db->table($this->table)->insert([
            'owner_id'    => (int) $owner_id,
            'name'        => $d['name'],
            'type'        => $d['type'],
            'address'     => $d['address'],
            'city'        => $d['city'] ?? '',
            'barangay'    => $d['barangay'] ?? '',
            'latitude'    => $d['latitude'] ?? null,
            'longitude'   => $d['longitude'] ?? null,
            'description' => $d['description'] ?? null,
            'image_url'   => $d['image_url'] ?? null,
            'contract_template' => $d['contract_template'] ?? null,
            'created_at'  => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function update_property($id, array $d)
    {
        $allowed = array_intersect_key($d, array_flip(['name', 'type', 'address', 'city', 'barangay', 'latitude', 'longitude', 'description', 'image_url', 'contract_template']));
        if (!$allowed) {
            return 0;
        }
        $allowed['updated_at'] = date('Y-m-d H:i:s');
        return $this->db->table($this->table)->where('id', (int) $id)->update($allowed);
    }

    public function delete_property($id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->delete();
    }

    public function has_active_leases($id)
    {
        return (bool) $this->db->raw(
            "SELECT 1 FROM leases l JOIN units u ON u.id = l.unit_id WHERE u.property_id = ? AND l.status = 'active' LIMIT 1",
            [(int) $id]
        )->fetchColumn();
    }

    public function has_lease_history($id)
    {
        return (bool) $this->db->raw(
            'SELECT 1 FROM leases l JOIN units u ON u.id = l.unit_id WHERE u.property_id = ? LIMIT 1', [(int) $id]
        )->fetchColumn();
    }
}
