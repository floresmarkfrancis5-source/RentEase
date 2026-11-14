<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Property_model - apartments / boarding houses (table: properties). */
class Property_model extends Model
{
    protected $table = 'properties';

    public function all_with_counts($owner_id = null, $archived = false)
    {
        $sql = "SELECT p.*,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.archived_at IS NULL) AS units_count,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.archived_at IS NULL
                       AND u.occupancy_status = 'occupied') AS occupied_count
               FROM properties p";
        $where = [$archived ? 'p.archived_at IS NOT NULL' : 'p.archived_at IS NULL'];
        $args = [];
        if ($owner_id !== null) {
            $where[] = 'p.owner_id = ?';
            $args[] = (int) $owner_id;
        }
        return $this->db->raw(
            $sql . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY p.name', $args
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $owner_id = null, $include_archived = false)
    {
        $sql = "SELECT p.*, (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.archived_at IS NULL) AS units_count,
                    (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.archived_at IS NULL
                       AND u.occupancy_status = 'occupied') AS occupied_count
               FROM properties p WHERE p.id = ?";
        $args = [(int) $id];
        if (!$include_archived) {
            $sql .= ' AND p.archived_at IS NULL';
        }
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

    public function archive($id, $owner_id)
    {
        $this->db->transaction();
        try {
            $property = $this->db->raw(
                'SELECT id FROM properties WHERE id = ? AND owner_id = ? AND archived_at IS NULL FOR UPDATE',
                [(int) $id, (int) $owner_id]
            )->fetch(PDO::FETCH_ASSOC);
            if (!$property) {
                $this->db->roll_back();
                return 'not_found';
            }

            $this->db->raw(
                'SELECT id FROM units WHERE property_id = ? FOR UPDATE',
                [(int) $id]
            )->fetchAll(PDO::FETCH_ASSOC);
            $lease = $this->db->raw(
                "SELECT l.id FROM leases l
                   JOIN units u ON u.id = l.unit_id
                  WHERE u.property_id = ? AND l.status IN ('active', 'scheduled', 'offered')
                  LIMIT 1 FOR UPDATE",
                [(int) $id]
            )->fetch(PDO::FETCH_ASSOC);
            if ($lease) {
                $this->db->roll_back();
                return 'has_current_lease';
            }

            $changed = $this->db->raw(
                'UPDATE properties SET archived_at = NOW(), updated_at = NOW()
                  WHERE id = ? AND owner_id = ? AND archived_at IS NULL',
                [(int) $id, (int) $owner_id]
            )->rowCount();
            if (!$changed) {
                $this->db->roll_back();
                return 'not_found';
            }
            $this->db->commit();
            return 'archived';
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function restore($id, $owner_id)
    {
        return $this->db->raw(
            'UPDATE properties SET archived_at = NULL, updated_at = NOW()
              WHERE id = ? AND owner_id = ? AND archived_at IS NOT NULL',
            [(int) $id, (int) $owner_id]
        )->rowCount() > 0;
    }
}
