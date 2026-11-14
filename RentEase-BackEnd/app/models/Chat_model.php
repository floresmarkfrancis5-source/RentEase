<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Chat_model extends Model
{
    protected $table = 'chat_conversations';

    public function ensure_general($landlord_id)
    {
        $landlord_id = (int) $landlord_id;
        $this->db->raw(
            "INSERT IGNORE INTO chat_conversations
                (landlord_id, conversation_type, room_key, created_by)
             VALUES (?, 'general', ?, ?)",
            [$landlord_id, 'general:' . $landlord_id, $landlord_id]
        );
        $row = $this->db->raw('SELECT id FROM chat_conversations WHERE room_key = ?', ['general:' . $landlord_id])->fetch(PDO::FETCH_ASSOC);
        $conversation_id = (int) $row['id'];
        $this->add_member($conversation_id, $landlord_id);
        $this->db->raw(
            "INSERT IGNORE INTO chat_members (conversation_id, user_id)
             SELECT ?, u.id
               FROM users u
               JOIN leases l ON l.tenant_id = u.id AND l.status = 'active'
               JOIN units un ON un.id = l.unit_id
               JOIN properties p ON p.id = un.property_id AND p.owner_id = ?
              WHERE u.landlord_id = ? AND u.role = 'tenant' AND u.is_active = 1
                AND l.start_date <= CURDATE() AND (l.end_date IS NULL OR l.end_date >= CURDATE())",
            [$conversation_id, $landlord_id, $landlord_id]
        );
        return $conversation_id;
    }

    public function ensure_direct($landlord_id, $tenant_id, $created_by)
    {
        $landlord_id = (int) $landlord_id;
        $tenant_id = (int) $tenant_id;
        $created_by = (int) $created_by;
        $room_key = 'direct:' . $landlord_id . ':' . $tenant_id;
        $this->db->raw(
            "INSERT IGNORE INTO chat_conversations
                (landlord_id, tenant_id, conversation_type, room_key, created_by)
             VALUES (?, ?, 'direct', ?, ?)",
            [$landlord_id, $tenant_id, $room_key, (int) $created_by]
        );
        $row = $this->db->raw('SELECT id FROM chat_conversations WHERE room_key = ?', [$room_key])->fetch(PDO::FETCH_ASSOC);
        $conversation_id = (int) $row['id'];
        $this->add_member($conversation_id, $landlord_id);
        $this->add_member($conversation_id, $tenant_id);
        if ($created_by === $landlord_id) {
            $this->db->raw(
                'UPDATE chat_members SET is_hidden = 0 WHERE conversation_id = ? AND user_id = ?',
                [$conversation_id, $landlord_id]
            );
        }
        return $conversation_id;
    }

    private function add_member($conversation_id, $user_id)
    {
        $this->db->raw(
            'INSERT IGNORE INTO chat_members (conversation_id, user_id) VALUES (?, ?)',
            [(int) $conversation_id, (int) $user_id]
        );
    }

    public function list_for_user($user_id, array $user)
    {
        $user_id = (int) $user_id;
        $landlord_id = ($user['role'] ?? '') === 'admin' ? $user_id : (int) ($user['landlord_id'] ?? 0);
        $this->ensure_general($landlord_id);

        if (($user['role'] ?? '') === 'tenant') {
            $this->ensure_direct($landlord_id, $user_id, $user_id);
        }

        return $this->db->raw(
            "SELECT c.id, c.conversation_type AS type, c.updated_at,
                    CASE WHEN c.conversation_type = 'general' THEN 'General'
                         WHEN ? = 'admin' THEN tenant.full_name
                         ELSE landlord.full_name END AS title,
                    CASE WHEN c.conversation_type = 'general' THEN 'Group chat'
                         WHEN ? = 'admin' THEN 'Tenant'
                         ELSE 'Landlord' END AS subtitle,
                    last_message.id AS last_message_id,
                    CASE WHEN last_message.id IS NULL THEN ''
                         WHEN last_message.is_unsent = 1 THEN 'Message unsent'
                         WHEN last_message.content IS NOT NULL AND last_message.content <> '' THEN last_message.content
                         ELSE 'Image' END AS last_message,
                    last_message.created_at AS last_message_at
               FROM chat_conversations c
               JOIN chat_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
               LEFT JOIN users landlord ON landlord.id = c.landlord_id
               LEFT JOIN users tenant ON tenant.id = c.tenant_id
               LEFT JOIN chat_messages last_message
                 ON last_message.id = (
                     SELECT MAX(m.id) FROM chat_messages m
                      WHERE m.conversation_id = c.id AND m.id > cm.cleared_through_id
                 )
              WHERE c.landlord_id = ?
                AND ((c.conversation_type = 'general'
                      AND (? = 'admin' OR EXISTS (
                          SELECT 1 FROM leases l
                          JOIN units un ON un.id = l.unit_id
                          JOIN properties p ON p.id = un.property_id
                           WHERE l.tenant_id = ? AND p.owner_id = c.landlord_id
                             AND l.status = 'active' AND l.start_date <= CURDATE()
                             AND (l.end_date IS NULL OR l.end_date >= CURDATE())
                      )))
                     OR (c.conversation_type = 'direct' AND
                         ((? = 'admin' AND (last_message.id IS NOT NULL OR (cm.is_hidden = 0 AND c.created_by = ?)))
                           OR (? = 'tenant' AND c.tenant_id = ?))))
              ORDER BY CASE WHEN c.conversation_type = 'general' THEN 0 ELSE 1 END,
                       COALESCE(last_message.created_at, c.updated_at) DESC, c.id DESC",
            [
                $user['role'], $user['role'], $user_id, $landlord_id,
                $user['role'], $user_id, $user['role'], $user_id, $user['role'], $user_id,
            ]
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find_accessible($conversation_id, $user_id, array $user)
    {
        $conversation = $this->db->raw(
            'SELECT * FROM chat_conversations WHERE id = ? LIMIT 1',
            [(int) $conversation_id]
        )->fetch(PDO::FETCH_ASSOC);
        if (!$conversation) {
            return null;
        }

        $role = $user['role'] ?? '';
        $is_member = (bool) $this->db->raw(
            'SELECT 1 FROM chat_members WHERE conversation_id = ? AND user_id = ?',
            [(int) $conversation_id, (int) $user_id]
        )->fetchColumn();
        if (!$is_member) {
            return null;
        }

        if ($role === 'admin' && (int) $conversation['landlord_id'] === (int) $user_id) {
            return $conversation;
        }
        if ($role !== 'tenant'
            || (int) ($user['landlord_id'] ?? 0) !== (int) $conversation['landlord_id']) {
            return null;
        }
        if ($conversation['conversation_type'] === 'direct') {
            return (int) $conversation['tenant_id'] === (int) $user_id ? $conversation : null;
        }
        $active_lease = $this->db->raw(
            "SELECT 1
               FROM leases l
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE l.tenant_id = ? AND p.owner_id = ? AND l.status = 'active'
                AND l.start_date <= CURDATE() AND (l.end_date IS NULL OR l.end_date >= CURDATE())
              LIMIT 1",
            [(int) $user_id, (int) $conversation['landlord_id']]
        )->fetchColumn();
        return $active_lease ? $conversation : null;
    }

    public function messages($conversation_id, $user_id, $before_id = null, $limit = 30)
    {
        $limit = max(1, min(50, (int) $limit));
        $sql = "SELECT m.id, m.sender_id, u.full_name AS sender_name, m.content, m.image_url,
                       m.is_unsent, m.created_at, m.reply_to_message_id,
                       replied_user.full_name AS reply_to_sender_name,
                       replied.content AS reply_to_content,
                       replied.image_url AS reply_to_image_url,
                       replied.is_unsent AS reply_to_is_unsent
                  FROM chat_messages m
                  JOIN users u ON u.id = m.sender_id
                  JOIN chat_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
                  LEFT JOIN chat_messages replied ON replied.id = m.reply_to_message_id
                  LEFT JOIN users replied_user ON replied_user.id = replied.sender_id
                 WHERE m.conversation_id = ? AND m.id > cm.cleared_through_id";
        $args = [(int) $user_id, (int) $conversation_id];
        if ($before_id !== null) {
            $sql .= ' AND m.id < ?';
            $args[] = (int) $before_id;
        }
        $sql .= ' ORDER BY m.id DESC LIMIT ' . ($limit + 1);
        $rows = $this->db->raw($sql, $args)->fetchAll(PDO::FETCH_ASSOC);
        $has_more = count($rows) > $limit;
        if ($has_more) {
            array_pop($rows);
        }
        $rows = array_reverse($rows);
        if (!$rows) {
            return ['messages' => [], 'has_more' => false, 'oldest_id' => null];
        }

        $ids = array_map(static function ($row) { return (int) $row['id']; }, $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $reaction_rows = $this->db->raw(
            "SELECT message_id, reaction, user_id FROM chat_reactions WHERE message_id IN ({$placeholders})",
            $ids
        )->fetchAll(PDO::FETCH_ASSOC);
        $reactions = [];
        foreach ($reaction_rows as $reaction) {
            $id = (int) $reaction['message_id'];
            if (!isset($reactions[$id])) {
                $reactions[$id] = ['like_count' => 0, 'dislike_count' => 0, 'haha_count' => 0, 'my_reaction' => null];
            }
            $key = [
                'like' => 'like_count',
                'dislike' => 'dislike_count',
                'haha' => 'haha_count',
            ][$reaction['reaction']];
            $reactions[$id][$key]++;
            if ((int) $reaction['user_id'] === (int) $user_id) {
                $reactions[$id]['my_reaction'] = $reaction['reaction'];
            }
        }
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['sender_id'] = (int) $row['sender_id'];
            $row['is_unsent'] = (bool) $row['is_unsent'];
            $row['reply_to_message_id'] = $row['reply_to_message_id'] === null ? null : (int) $row['reply_to_message_id'];
            $row['reply_to_is_unsent'] = (bool) $row['reply_to_is_unsent'];
            $row += $reactions[$row['id']] ?? ['like_count' => 0, 'dislike_count' => 0, 'haha_count' => 0, 'my_reaction' => null];
        }
        unset($row);

        return [
            'messages' => $rows,
            'has_more' => $has_more,
            'oldest_id' => (int) $rows[0]['id'],
        ];
    }

    public function reply_target($message_id, $conversation_id, $user_id)
    {
        return $this->db->raw(
            'SELECT m.id FROM chat_messages m
              JOIN chat_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
             WHERE m.id = ? AND m.conversation_id = ? AND m.id > cm.cleared_through_id
             LIMIT 1',
            [(int) $user_id, (int) $message_id, (int) $conversation_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function create_message($conversation_id, $sender_id, $content, $image_url = null, $image_public_id = null, $reply_to_message_id = null)
    {
        $this->db->table('chat_messages')->insert([
            'conversation_id' => (int) $conversation_id,
            'sender_id' => (int) $sender_id,
            'content' => $content,
            'image_url' => $image_url,
            'image_public_id' => $image_public_id,
            'reply_to_message_id' => $reply_to_message_id === null ? null : (int) $reply_to_message_id,
        ]);
        $message_id = (int) $this->db->last_id();
        $this->db->raw('UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?', [(int) $conversation_id]);
        return $message_id;
    }

    public function clear_for_user($conversation_id, $user_id, $hide = false)
    {
        return $this->db->raw(
            "UPDATE chat_members cm
                SET cleared_through_id = COALESCE(
                    (SELECT MAX(id) FROM chat_messages WHERE conversation_id = cm.conversation_id), 0
                ), is_hidden = ?
              WHERE cm.conversation_id = ? AND cm.user_id = ?",
            [(int) $hide, (int) $conversation_id, (int) $user_id]
        )->rowCount();
    }

    public function unsend($message_id, $sender_id, $conversation_id)
    {
        $updated = $this->db->raw(
            "UPDATE chat_messages SET is_unsent = 1, content = NULL, image_url = NULL, image_public_id = NULL
              WHERE id = ? AND sender_id = ? AND conversation_id = ? AND is_unsent = 0",
            [(int) $message_id, (int) $sender_id, (int) $conversation_id]
        )->rowCount() > 0;
        if ($updated) {
            $this->db->raw('DELETE FROM chat_reactions WHERE message_id = ?', [(int) $message_id]);
        }
        return $updated;
    }

    public function message_in_conversation($message_id, $conversation_id, $user_id)
    {
        return $this->db->raw(
            'SELECT m.id FROM chat_messages m
              JOIN chat_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
             WHERE m.id = ? AND m.conversation_id = ? AND m.id > cm.cleared_through_id
               AND m.is_unsent = 0 LIMIT 1',
            [(int) $user_id, (int) $message_id, (int) $conversation_id]
        )->fetch(PDO::FETCH_ASSOC);
    }

    public function set_reaction($message_id, $user_id, $reaction)
    {
        $this->db->raw(
            'INSERT INTO chat_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reaction = VALUES(reaction)',
            [(int) $message_id, (int) $user_id, $reaction]
        );
    }

    public function remove_reaction($message_id, $user_id)
    {
        return $this->db->raw(
            'DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ?',
            [(int) $message_id, (int) $user_id]
        )->rowCount();
    }
}
