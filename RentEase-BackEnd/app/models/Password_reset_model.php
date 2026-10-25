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
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where_null('used_at')
            ->update(['used_at' => $this->database_now()]);
    }

    public function revoke_previous($user_id, $except_id)
    {
        return $this->db->table($this->table)
            ->where('user_id', (int) $user_id)
            ->where('id', '<>', (int) $except_id)
            ->where_null('used_at')
            ->update(['used_at' => $this->database_now()]);
    }

    public function revoke($id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where_null('used_at')
            ->update(['used_at' => $this->database_now()]);
    }

    public function complete_reset($token_hash, $password_hash, User_model $user_model)
    {
        $this->db->transaction();
        try {
            $token = $this->valid_token($token_hash, true);
            if (!$token) {
                $this->db->roll_back();
                return false;
            }
            $user_model->update_user($token['user_id'], [
                'password' => $password_hash,
                'must_change_password' => 0,
            ]);
            $this->consume($token['id']);
            $this->revoke_previous($token['user_id'], $token['id']);
            $user_model->delete_refresh_tokens($token['user_id']);
            $this->db->commit();
            return true;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    private function database_now()
    {
        return $this->db->raw('SELECT NOW()')->fetchColumn();
    }
}
