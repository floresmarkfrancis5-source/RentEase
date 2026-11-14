<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Announcement_model extends Model
{
    protected $table = 'landlord_announcements';

    public function list_for_landlord($landlord_id, $published_only = false)
    {
        $sql = 'SELECT id, title, body, is_published, created_at, updated_at
                  FROM landlord_announcements WHERE landlord_id = ?';
        $args = [(int) $landlord_id];
        if ($published_only) {
            $sql .= ' AND is_published = 1';
        }
        return $this->db->raw($sql . ' ORDER BY created_at DESC, id DESC LIMIT 100', $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function create($landlord_id, array $data)
    {
        $this->db->table($this->table)->insert([
            'landlord_id' => (int) $landlord_id,
            'title' => $data['title'],
            'body' => $data['body'],
            'is_published' => (int) $data['is_published'],
        ]);
        return (int) $this->db->last_id();
    }

    public function update_announcement($id, $landlord_id, array $data)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where('landlord_id', (int) $landlord_id)
            ->update($data);
    }

    public function delete_announcement($id, $landlord_id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $id)
            ->where('landlord_id', (int) $landlord_id)
            ->delete();
    }
}
