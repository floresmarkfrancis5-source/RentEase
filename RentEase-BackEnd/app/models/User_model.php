<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * User_model - accounts (table: users). Roles: superadmin, admin (landlord), and tenant.
 */
class User_model extends Model
{
    protected $table = 'users';

    const PUBLIC_COLS = 'id, username, email, full_name, phone, role, landlord_id, onboarding_completed, is_active, must_change_password, google_id IS NOT NULL AS google_linked, created_at';

    public function find_by_login($login)
    {
        return $this->db->table($this->table)->where('username', $login)->or_where('email', strtolower($login))->get();
    }

    public function find_by_id($id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->get();
    }

    public function lock_for_update($id)
    {
        return $this->db->raw('SELECT id FROM users WHERE id = ? FOR UPDATE', [(int) $id])->fetchColumn();
    }

    public function find_by_email($email)
    {
        return $this->db->table($this->table)->where('email', strtolower($email))->get();
    }

    public function find_by_google_id($gid)
    {
        return $this->db->table($this->table)->where('google_id', $gid)->get();
    }

    public function tenant_landlord_active(array $user)
    {
        if (($user['role'] ?? null) !== 'tenant') {
            return true;
        }
        return (bool) $this->db->table($this->table)
            ->select('id')
            ->where('id', (int) ($user['landlord_id'] ?? 0))
            ->where('role', 'admin')
            ->where('is_active', 1)
            ->limit(1)
            ->get();
    }

    public function landlords()
    {
        return $this->db->raw(
            "SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.onboarding_completed,
                    u.google_id IS NOT NULL AS google_linked, u.created_at,
                    COUNT(DISTINCT p.id) AS property_count,
                    COUNT(DISTINCT t.id) AS tenant_count
               FROM users u
          LEFT JOIN properties p ON p.owner_id = u.id
          LEFT JOIN users t ON t.landlord_id = u.id AND t.role = 'tenant'
              WHERE u.role = 'admin'
           GROUP BY u.id
           ORDER BY u.created_at DESC, u.id DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find_landlord($id)
    {
        return $this->db->table($this->table)
            ->select('id, username, email, full_name, is_active')
            ->where('id', (int) $id)
            ->where('role', 'admin')
            ->limit(1)
            ->get();
    }

    public function superadmins()
    {
        return $this->db->raw(
            "SELECT id, username, email, full_name, is_active, google_id IS NOT NULL AS google_linked, created_at
               FROM users WHERE role = 'superadmin' ORDER BY created_at, id"
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function active_superadmin_count()
    {
        return (int) $this->db->table($this->table)
            ->where('role', 'superadmin')
            ->where('is_active', 1)
            ->count();
    }

    public function taken($username, $email, $exclude_id = 0)
    {
        return (bool) $this->db->raw(
            'SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ? LIMIT 1',
            [$username, $email, (int) $exclude_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    /** Is this username / email already used by someone else?  ($field is whitelisted) */
    public function field_taken($field, $value, $exclude_id = 0)
    {
        if (!in_array($field, ['username', 'email'], true)) {
            return true;
        }
        return (bool) $this->db->table($this->table)
            ->select('id')
            ->where($field, $value)
            ->where('id', '<>', (int) $exclude_id)
            ->limit(1)
            ->get();
    }

    /** Build a unique username from the e-mail address ("juan@x.com" -> "juan", "juan2", ...). */
    public function unique_username($email)
    {
        $base = preg_replace('/[^a-z0-9_.-]/', '', strtolower(strstr($email, '@', true)));
        $base = substr($base !== '' ? $base : 'tenant', 0, 40);
        $name = $base;
        $i = 1;
        while ($this->db->table($this->table)->select('id')->where('username', $name)->limit(1)->get()) {
            $name = $base . (++$i);
        }
        return $name;
    }

    public function create_user(array $d)
    {
        $this->db->table($this->table)->insert([
            'username'             => $d['username'],
            'email'                => $d['email'],
            'password'             => $d['password'],
            'full_name'            => $d['full_name'] ?? '',
            'phone'                => $d['phone'] ?? null,
            'role'                 => $d['role'] ?? 'tenant',
            'landlord_id'          => $d['landlord_id'] ?? null,
            'onboarding_completed' => (int) ($d['onboarding_completed'] ?? 1),
            'google_id'            => $d['google_id'] ?? null,
            'is_active'            => 1,
            'must_change_password' => (int) ($d['must_change_password'] ?? 0),
            'created_at'           => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function update_user($id, array $d)
    {
        $allowed = array_intersect_key($d, array_flip(['username', 'email', 'full_name', 'phone', 'is_active', 'password', 'must_change_password', 'google_id', 'onboarding_completed']));
        if (!$allowed) {
            return 0;
        }
        $allowed['updated_at'] = date('Y-m-d H:i:s');
        return $this->db->table($this->table)->where('id', (int) $id)->update($allowed);
    }

    /** Tenants with their current (active) unit, for the landlord's tenant list. */
    public function tenants($landlord_id = null)
    {
        $sql = "SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.must_change_password, u.created_at,
                    u.google_id IS NOT NULL AS google_linked,
                    un.unit_name, p.name AS property_name, l.id AS lease_id
               FROM users u
          LEFT JOIN leases l      ON l.tenant_id = u.id AND l.status = 'active'
          LEFT JOIN units un      ON un.id = l.unit_id
          LEFT JOIN properties p  ON p.id = un.property_id
              WHERE u.role = 'tenant'";
        $args = [];
        if ($landlord_id !== null) {
            $sql .= ' AND u.landlord_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw($sql . ' ORDER BY u.full_name, u.id', $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find_tenant($id, $landlord_id = null)
    {
        $query = $this->db->table($this->table)
            ->select('id, username, email, full_name, phone, is_active, must_change_password, created_at')
            ->where('id', (int) $id)
            ->where('role', 'tenant');
        if ($landlord_id !== null) {
            $query->where('landlord_id', (int) $landlord_id);
        }
        return $query->limit(1)->get();
    }

    public function has_history($id)
    {
        return (bool) $this->db->raw(
            'SELECT (SELECT COUNT(*) FROM leases WHERE tenant_id = ?)
                  + (SELECT COUNT(*) FROM bills WHERE tenant_id = ?)
                  + (SELECT COUNT(*) FROM unit_transfer_requests WHERE tenant_id = ?) AS n',
            [(int) $id, (int) $id, (int) $id]
        )->fetchColumn();
    }

    public function delete_user($id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->delete();
    }
}
