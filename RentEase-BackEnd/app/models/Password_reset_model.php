<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Password_reset_model - hashed, expiring and single-use password reset tokens. */
class Password_reset_model extends Model
{
    protected $table = 'password_reset_tokens';

    public function create($user_id, $token_hash)
    {
        $this->db->table($this->table)->insert([
            'user_id' => (int) $user_id,
            'token_hash' => $token_hash,
            'expires_at' => date('Y-m-d H:i:s', time() + 1800),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function valid_token($token_hash, $lock = false)
    {
        $sql = 'SELECT id, user_id FROM password_reset_tokens
                 WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()';
        if ($lock) {
            $sql .= ' FOR UPDATE';
        }
        return $this->db->raw($sql, [$token_hash])->fetch(PDO::FETCH_ASSOC);
    }

    public function consume($id)
    {
        return $this->db->raw(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
            [(int) $id]
        )->rowCount();
    }

    public function revoke_previous($user_id, $except_id)
    {
        return $this->db->raw(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND id <> ? AND used_at IS NULL',
            [(int) $user_id, (int) $except_id]
        )->rowCount();
    }

    public function revoke($id)
    {
        return $this->db->raw(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
            [(int) $id]
        )->rowCount();
    }
}
