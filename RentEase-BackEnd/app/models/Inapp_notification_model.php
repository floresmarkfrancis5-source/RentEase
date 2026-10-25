<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Inapp_notification_model - persistent notices shown in the signed-in user's header. */
class Inapp_notification_model extends Model
{
    protected $table = 'in_app_notifications';

    public function create($user_id, $type, $title, $message, $related_id = null)
    {
        $this->db->table($this->table)->insert([
            'user_id' => (int) $user_id,
            'type' => substr($type, 0, 40),
            'title' => substr($title, 0, 180),
            'message' => substr($message, 0, 500),
            'related_id' => $related_id ? (int) $related_id : null,
            'is_read' => 0,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function notify_landlord($landlord_id, $type, $title, $message, $related_id = null)
    {
        if ($landlord_id) {
            $this->create((int) $landlord_id, $type, $title, $message, $related_id);
        }
    }

    public function list_for_user($user_id, $limit = 25)
    {
        return $this->db->raw(
            'SELECT id, type, title, message, related_id, is_read, created_at
               FROM in_app_notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ' . max(1, (int) $limit),
            [(int) $user_id]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function unread_count($user_id)
    {
        return (int) $this->db->table($this->table)
            ->where('user_id', (int) $user_id)
            ->where('is_read', 0)
            ->count();
    }

    public function mark_read($id, $user_id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where('user_id', (int) $user_id)
            ->update(['is_read' => 1]);
    }

    public function belongs_to_user($id, $user_id)
    {
        return (bool) $this->db->table($this->table)
            ->select('id')
            ->where('id', (int) $id)
            ->where('user_id', (int) $user_id)
            ->limit(1)
            ->get();
    }

    public function mark_all_read($user_id)
    {
        return $this->db->table($this->table)
            ->where('user_id', (int) $user_id)
            ->where('is_read', 0)
            ->update(['is_read' => 1]);
    }
}
