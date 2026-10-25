<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Unit_model - rooms/units inside a property (table: units). */
class Unit_model extends Model
{
    protected $table = 'units';

    private const SELECT = "SELECT u.*, p.name AS property_name, p.address, p.latitude, p.longitude,
                    t.full_name AS tenant_name, l.id AS lease_id
               FROM units u
               JOIN properties p ON p.id = u.property_id
          LEFT JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
          LEFT JOIN users t  ON t.id = l.tenant_id";

    public function list_units($property_id = null, $owner_id = null)
    {
        $where = [];
        $args = [];
        if ($property_id) {
            $where[] = 'u.property_id = ?';
            $args[] = (int) $property_id;
        }
        if ($owner_id !== null) {
            $where[] = 'p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw(self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY p.name, u.unit_name', $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $owner_id = null)
    {
        $sql = self::SELECT . ' WHERE u.id = ?';
        $args = [(int) $id];
        if ($owner_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function available_for_lease($id, $lock = false, $owner_id = null)
    {
        $sql = "SELECT u.*, p.name AS property_name
                  FROM units u JOIN properties p ON p.id = u.property_id
                 WHERE u.id = ? AND u.occupancy_status = 'vacant' AND u.condition_tag = 'good_condition'";
        $args = [(int) $id];
        if ($owner_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function available_units($owner_id = null)
    {
        $sql = "SELECT u.id, u.unit_name, u.monthly_rent, p.name AS property_name
               FROM units u JOIN properties p ON p.id = u.property_id
              WHERE u.occupancy_status = 'vacant' AND u.condition_tag = 'good_condition'";
        $args = [];
        if ($owner_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw($sql . ' ORDER BY p.name, u.unit_name', $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function name_taken($property_id, $unit_name, $exclude_id = 0)
    {
        return (bool) $this->db->table($this->table)
            ->select('id')
            ->where('property_id', (int) $property_id)
            ->where('unit_name', $unit_name)
            ->where('id', '<>', (int) $exclude_id)
            ->limit(1)
            ->get();
    }

    public function create_unit(array $d)
    {
        $this->db->table($this->table)->insert([
            'property_id'  => (int) $d['property_id'],
            'unit_name'    => $d['unit_name'],
            'monthly_rent' => $d['monthly_rent'],
            'capacity'     => $d['capacity'],
            'condition_tag' => $d['condition_tag'] ?? 'good_condition',
            'notes'        => $d['notes'] ?? null,
            'created_at'   => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function update_unit($id, array $d)
    {
        $allowed = array_intersect_key($d, array_flip(['property_id', 'unit_name', 'monthly_rent', 'capacity', 'condition_tag', 'notes']));
        if (!$allowed) {
            return 0;
        }
        $allowed['updated_at'] = date('Y-m-d H:i:s');
        return $this->db->table($this->table)->where('id', (int) $id)->update($allowed);
    }

    public function set_occupancy($id, $status)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->update(['occupancy_status' => $status]);
    }

    public function has_leases($id)
    {
        return (bool) $this->db->table('leases')->select('id')->where('unit_id', (int) $id)->limit(1)->get();
    }

    public function delete_unit($id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->delete();
    }
}
