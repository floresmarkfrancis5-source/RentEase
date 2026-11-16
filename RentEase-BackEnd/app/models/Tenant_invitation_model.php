<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Tenant_invitation_model extends Model
{
    protected $table = 'tenant_invitation_tokens';

    public function create_invitation($user_id)
    {
        $raw_token   = bin2hex(random_bytes(32));
        $token_hash  = hash('sha256', $raw_token);
        $expires_at  = date('Y-m-d H:i:s', time() + 7 * 86400);

        $this->db->table($this->table)
            ->where('user_id', (int) $user_id)
            ->where_null('used_at')
            ->update(['used_at' => date('Y-m-d H:i:s')]);

        $this->db->table($this->table)->insert([
            'user_id'    => (int) $user_id,
            'token_hash' => $token_hash,
            'expires_at' => $expires_at,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return [
            'token'      => $raw_token,
            'expires_at' => $expires_at,
        ];
    }

    public function find_valid($token_hash, $lock = false)
    {
        $sql = "SELECT t.id, t.user_id, t.expires_at, t.created_at,
                       u.username, u.email, u.full_name, u.phone, u.role, u.is_active,
                       u.email_verified_at, u.landlord_id,
                       un.unit_name, p.name AS property_name
                  FROM {$this->table} t
                  JOIN users u       ON u.id = t.user_id
             LEFT JOIN leases l      ON l.tenant_id = u.id AND l.status = 'active'
             LEFT JOIN units un      ON un.id = l.unit_id
             LEFT JOIN properties p  ON p.id = un.property_id
                 WHERE t.token_hash = ?
                   AND t.used_at IS NULL
                   AND t.expires_at > NOW()";
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        return $this->db->raw($sql, [$token_hash])->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * Mark token as consumed.
     */
    public function consume($id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where_null('used_at')
            ->update(['used_at' => date('Y-m-d H:i:s')]);
    }

    public function complete_activation($token_hash, $new_password, User_model $user_model)
    {
        $this->db->transaction();
        try {
            $record = $this->find_valid($token_hash, true);
            if (!$record) {
                $this->db->roll_back();
                return null;
            }

            $user_model->update_user($record['user_id'], [
                'password'             => password_hash($new_password, PASSWORD_DEFAULT),
                'must_change_password' => 0,
                'email_verified_at'    => date('Y-m-d H:i:s'),
                'is_active'            => 1,
            ]);

            $this->consume($record['id']);
            $this->db->commit();
            return $record;
        } catch (\Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    public function complete_activation_google($token_hash, $google_id, User_model $user_model)
    {
        $this->db->transaction();
        try {
            $record = $this->find_valid($token_hash, true);
            if (!$record) {
                $this->db->roll_back();
                return null;
            }

            $user_model->update_user($record['user_id'], [
                'google_id'            => $google_id,
                'must_change_password' => 0,
                'email_verified_at'    => date('Y-m-d H:i:s'),
                'is_active'            => 1,
            ]);

            $this->consume($record['id']);
            $this->db->commit();
            return $record;
        } catch (\Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }
}
