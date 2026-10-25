<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Notification_model - one row per e-mail the system tried to send (table: notifications_log). */
class Notification_model extends Model
{
    protected $table = 'notifications_log';

    public function log($user_id, $type, $related_id, $recipient, $subject, $status, $error = null)
    {
        $this->db->table($this->table)->insert([
            'user_id'    => $user_id ? (int) $user_id : null,
            'type'       => $type,
            'related_id' => $related_id ? (int) $related_id : null,
            'channel'    => 'email',
            'recipient'  => substr($recipient, 0, 255),
            'subject'    => substr($subject, 0, 200),
            'status'     => $status,
            'error'      => $error ? substr($error, 0, 500) : null,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function recent($limit = 100, $landlord_id = null)
    {
        $sql = 'SELECT n.*, u.full_name FROM notifications_log n LEFT JOIN users u ON u.id = n.user_id';
        $args = [];
        if ($landlord_id !== null) {
            $sql .= ' WHERE n.user_id = ? OR n.user_id IN (SELECT id FROM users WHERE landlord_id = ?)';
            $args = [(int) $landlord_id, (int) $landlord_id];
        }
        return $this->db->raw($sql . ' ORDER BY n.id DESC LIMIT ' . (int) $limit, $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Was a notification of this type already sent for this record in the last $hours hours? */
    public function sent_recently($type, $related_id, $hours)
    {
        return (bool) $this->db->raw(
            "SELECT 1 FROM notifications_log WHERE type = ? AND related_id = ? AND status = 'sent'
                AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR) LIMIT 1",
            [$type, (int) $related_id, (int) $hours]
        )->fetchColumn();
    }
}
