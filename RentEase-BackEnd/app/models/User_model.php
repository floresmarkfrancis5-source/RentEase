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
                    a.avatar_url, (a.user_id IS NOT NULL) AS has_avatar,
                    COUNT(DISTINCT p.id) AS property_count,
                    COUNT(DISTINCT t.id) AS tenant_count
               FROM users u
          LEFT JOIN user_avatars a ON a.user_id = u.id
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

    public function find_superadmin($id)
    {
        return $this->db->table($this->table)
            ->select('id, is_active')
            ->where('id', (int) $id)
            ->where('role', 'superadmin')
            ->limit(1)
            ->get();
    }

    public function superadmins()
    {
        return $this->db->raw(
            "SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.google_id IS NOT NULL AS google_linked, u.created_at,
                    a.avatar_url, (a.user_id IS NOT NULL) AS has_avatar
               FROM users u
          LEFT JOIN user_avatars a ON a.user_id = u.id
              WHERE u.role = 'superadmin' ORDER BY u.created_at, u.id"
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

    public function create_tenant_with_lease(array $user, array $lease, $landlord_id, Unit_model $unit_model, Lease_model $lease_model, Tenant_invitation_model $invitation_model)
    {
        $this->db->transaction();
        try {
            $unit = $unit_model->available_for_lease($lease['unit_id'], true, $landlord_id);
            if (!$unit) {
                $this->db->roll_back();
                return null;
            }

            $id = $this->create_user($user);
            $lease['tenant_id'] = $id;
            $lease['start_date'] = $lease['start_date'] ?? date('Y-m-d', strtotime('+5 days'));
            if (empty($lease['end_date']) && !empty($lease['contract_months'])) {
                $end = new DateTime($lease['start_date']);
                $end->modify('+' . (int) $lease['contract_months'] . ' months')->modify('-1 day');
                $lease['end_date'] = $end->format('Y-m-d');
            }
            $lease['monthly_rent'] = $lease['monthly_rent'] ?? $unit['monthly_rent'];
            $lease['deposit'] = $lease['deposit'] ?? $unit['default_deposit'] ?? 0;
            $lease['due_day'] = $lease['due_day'] ?? $unit['default_due_day'] ?? 5;
            $lease['contract_json'] = $lease['contract_json']
                ?? ($unit['contract_template'] ?: ($unit['property_contract_template'] ?? null));
            if (!array_key_exists('contract_required', $lease)) {
                $template = $lease['contract_json'] ? json_decode($lease['contract_json'], true) : null;
                $lease['contract_required'] = !empty($template['enabled']);
            }
            if (empty($lease['contract_required'])) {
                $lease['contract_json'] = null;
            }
            $lease_model->create_lease_in_transaction($lease, $landlord_id);
            $invitation = $invitation_model->create_invitation($id);
            $tenant_record = $this->find_tenant($id, $landlord_id);
            if (!$tenant_record) {
                throw new RuntimeException('The newly created tenant could not be loaded.');
            }
            $this->db->commit();
            return ['id' => $id, 'unit' => $unit, 'invitation' => $invitation, 'data' => $tenant_record];
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function update_user($id, array $d)
    {
        $allowed = array_intersect_key($d, array_flip(['username', 'email', 'full_name', 'phone', 'is_active', 'password', 'must_change_password', 'email_verified_at', 'google_id', 'onboarding_completed']));
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
                    u.email_verified_at,
                    (u.email_verified_at IS NOT NULL) AS email_verified,
                    u.google_id IS NOT NULL AS google_linked,
                    a.avatar_url, (a.user_id IS NOT NULL) AS has_avatar,
                    un.unit_name, p.name AS property_name, l.id AS lease_id,
                    l.status AS lease_status, l.start_date AS lease_start_date
               FROM users u
          LEFT JOIN user_avatars a ON a.user_id = u.id
          LEFT JOIN leases l      ON l.tenant_id = u.id AND l.status IN ('offered','active','scheduled')
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
            ->select('id, username, email, full_name, phone, is_active, must_change_password, email_verified_at, created_at')
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

    public function delete_refresh_tokens($id)
    {
        return $this->db->table('refresh_tokens')->where('user_id', (int) $id)->delete();
    }

    public function set_landlord_active($id, $is_active)
    {
        $this->db->transaction();
        try {
            $this->update_user($id, ['is_active' => (int) $is_active]);
            if (!(int) $is_active) {
                $this->delete_refresh_tokens($id);
            }
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function set_superadmin_active($id, $is_active, $was_active)
    {
        if ((int) $is_active) {
            $this->update_user($id, ['is_active' => 1]);
            return true;
        }

        $this->db->transaction();
        try {
            $this->db->raw('SELECT id FROM users WHERE role = ? FOR UPDATE', ['superadmin'])->fetchAll(PDO::FETCH_COLUMN);
            if ((int) $was_active === 1 && $this->active_superadmin_count() <= 1) {
                $this->db->roll_back();
                return false;
            }
            $this->update_user($id, ['is_active' => 0]);
            $this->delete_refresh_tokens($id);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    private function _in_placeholders(array $items)
    {
        return implode(',', array_fill(0, count($items), '?'));
    }

    /**
     * Permanently delete a landlord account and purge all associated properties,
     * units, leases, bills, payments, maintenance, and tenant accounts in an atomic transaction.
     */
    public function delete_landlord($id)
    {
        $landlord_id = (int) $id;
        $this->db->transaction();
        try {
            // 1. Properties owned by landlord
            $prop_rows = $this->db->table('properties')
                ->select('id')
                ->where('owner_id', $landlord_id)
                ->get_all(PDO::FETCH_ASSOC) ?: [];
            $property_ids = array_map('intval', array_column($prop_rows, 'id'));

            // 2. Units in those properties
            $unit_ids = [];
            if (!empty($property_ids)) {
                $p = $this->_in_placeholders($property_ids);
                $unit_rows = $this->db->raw("SELECT id FROM units WHERE property_id IN ($p)", $property_ids)->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $unit_ids = array_map('intval', array_column($unit_rows, 'id'));
            }

            // 3. Tenants assigned to this landlord
            $tenant_rows = $this->db->table('users')
                ->select('id')
                ->where('landlord_id', $landlord_id)
                ->where('role', 'tenant')
                ->get_all(PDO::FETCH_ASSOC) ?: [];
            $tenant_ids = array_map('intval', array_column($tenant_rows, 'id'));

            // 4. Leases
            $lease_ids = [];
            if (!empty($unit_ids) || !empty($tenant_ids)) {
                $conds = [];
                $args  = [];
                if (!empty($unit_ids)) {
                    $conds[] = "unit_id IN (" . $this->_in_placeholders($unit_ids) . ")";
                    $args = array_merge($args, $unit_ids);
                }
                if (!empty($tenant_ids)) {
                    $conds[] = "tenant_id IN (" . $this->_in_placeholders($tenant_ids) . ")";
                    $args = array_merge($args, $tenant_ids);
                }
                $lease_rows = $this->db->raw("SELECT id FROM leases WHERE " . implode(' OR ', $conds), $args)->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $lease_ids = array_map('intval', array_column($lease_rows, 'id'));
            }

            // 5. Lease documents & Lease events
            if (!empty($lease_ids)) {
                $p = $this->_in_placeholders($lease_ids);
                $this->db->raw("DELETE FROM lease_documents WHERE lease_id IN ($p)", $lease_ids);
                $this->db->raw("DELETE FROM lease_events WHERE lease_id IN ($p)", $lease_ids);
            }

            // 6. Bills & Payments
            $bill_ids = [];
            if (!empty($lease_ids) || !empty($tenant_ids)) {
                $conds = [];
                $args  = [];
                if (!empty($lease_ids)) {
                    $conds[] = "lease_id IN (" . $this->_in_placeholders($lease_ids) . ")";
                    $args = array_merge($args, $lease_ids);
                }
                if (!empty($tenant_ids)) {
                    $conds[] = "tenant_id IN (" . $this->_in_placeholders($tenant_ids) . ")";
                    $args = array_merge($args, $tenant_ids);
                }
                $bill_rows = $this->db->raw("SELECT id FROM bills WHERE " . implode(' OR ', $conds), $args)->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $bill_ids = array_map('intval', array_column($bill_rows, 'id'));
            }

            // Delete payments
            $pay_conds = ['recorded_by = ?'];
            $pay_args  = [$landlord_id];
            if (!empty($bill_ids)) {
                $pay_conds[] = "bill_id IN (" . $this->_in_placeholders($bill_ids) . ")";
                $pay_args = array_merge($pay_args, $bill_ids);
            }
            if (!empty($tenant_ids)) {
                $pay_conds[] = "tenant_id IN (" . $this->_in_placeholders($tenant_ids) . ")";
                $pay_args = array_merge($pay_args, $tenant_ids);
            }
            $this->db->raw("DELETE FROM payments WHERE " . implode(' OR ', $pay_conds), $pay_args);

            // Delete bills
            if (!empty($bill_ids)) {
                $p = $this->_in_placeholders($bill_ids);
                $this->db->raw("DELETE FROM bills WHERE id IN ($p)", $bill_ids);
            }

            // 7. Maintenance requests & images
            $maint_ids = [];
            if (!empty($unit_ids) || !empty($tenant_ids)) {
                $conds = [];
                $args  = [];
                if (!empty($unit_ids)) {
                    $conds[] = "unit_id IN (" . $this->_in_placeholders($unit_ids) . ")";
                    $args = array_merge($args, $unit_ids);
                }
                if (!empty($tenant_ids)) {
                    $conds[] = "tenant_id IN (" . $this->_in_placeholders($tenant_ids) . ")";
                    $args = array_merge($args, $tenant_ids);
                }
                $maint_rows = $this->db->raw("SELECT id FROM maintenance_requests WHERE " . implode(' OR ', $conds), $args)->fetchAll(PDO::FETCH_ASSOC) ?: [];
                $maint_ids = array_map('intval', array_column($maint_rows, 'id'));
            }

            if (!empty($maint_ids)) {
                $p = $this->_in_placeholders($maint_ids);
                $this->db->raw("DELETE FROM maintenance_images WHERE request_id IN ($p)", $maint_ids);
                $this->db->raw("DELETE FROM maintenance_requests WHERE id IN ($p)", $maint_ids);
            }

            // 8. Unit transfer requests
            $transfer_conds = ['decided_by = ?'];
            $transfer_args  = [$landlord_id];
            if (!empty($unit_ids)) {
                $p = $this->_in_placeholders($unit_ids);
                $transfer_conds[] = "from_unit_id IN ($p) OR to_unit_id IN ($p)";
                $transfer_args = array_merge($transfer_args, $unit_ids, $unit_ids);
            }
            if (!empty($tenant_ids)) {
                $p = $this->_in_placeholders($tenant_ids);
                $transfer_conds[] = "tenant_id IN ($p)";
                $transfer_args = array_merge($transfer_args, $tenant_ids);
            }
            $this->db->raw("DELETE FROM unit_transfer_requests WHERE " . implode(' OR ', $transfer_conds), $transfer_args);

            // 9. Leases
            if (!empty($lease_ids)) {
                $p = $this->_in_placeholders($lease_ids);
                $this->db->raw("DELETE FROM leases WHERE id IN ($p)", $lease_ids);
            }

            // 10. Units
            if (!empty($unit_ids)) {
                $p = $this->_in_placeholders($unit_ids);
                $this->db->raw("DELETE FROM units WHERE id IN ($p)", $unit_ids);
            }

            // 11. Properties
            if (!empty($property_ids)) {
                $p = $this->_in_placeholders($property_ids);
                $this->db->raw("DELETE FROM properties WHERE id IN ($p)", $property_ids);
            }

            // 12. Tenant users and their personal records
            if (!empty($tenant_ids)) {
                $p = $this->_in_placeholders($tenant_ids);
                $this->db->raw("DELETE FROM tenant_invitations WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM user_avatars WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM in_app_notifications WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM refresh_tokens WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM password_resets WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM notifications_log WHERE user_id IN ($p)", $tenant_ids);
                $this->db->raw("DELETE FROM users WHERE id IN ($p)", $tenant_ids);
            }

            // 13. Landlord artifacts
            $this->db->table('user_avatars')->where('user_id', $landlord_id)->delete();
            $this->db->table('refresh_tokens')->where('user_id', $landlord_id)->delete();
            $this->db->table('password_resets')->where('user_id', $landlord_id)->delete();
            $this->db->table('in_app_notifications')->where('user_id', $landlord_id)->delete();
            $this->db->table('notifications_log')->where('user_id', $landlord_id)->delete();

            // Assistant conversations & messages
            $conv_rows = $this->db->table('assistant_conversations')
                ->select('id')
                ->where('user_id', $landlord_id)
                ->get_all(PDO::FETCH_ASSOC) ?: [];
            $conv_ids = array_map('intval', array_column($conv_rows, 'id'));
            if (!empty($conv_ids)) {
                $p = $this->_in_placeholders($conv_ids);
                $this->db->raw("DELETE FROM assistant_messages WHERE conversation_id IN ($p)", $conv_ids);
                $this->db->raw("DELETE FROM assistant_conversations WHERE id IN ($p)", $conv_ids);
            }

            // 14. Finally, delete the landlord user record
            $this->db->table($this->table)->where('id', $landlord_id)->where('role', 'admin')->delete();

            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }
}
