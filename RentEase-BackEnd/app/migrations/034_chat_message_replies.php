<?php

class Chat_message_replies
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    private function has_column($table, $column)
    {
        return (int) $this->_lava->db->raw(
            'SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column]
        )->fetchColumn() > 0;
    }

    public function up()
    {
        if (!$this->has_column('chat_messages', 'reply_to_message_id')) {
            $this->_lava->db->raw(
                'ALTER TABLE chat_messages
                    ADD COLUMN reply_to_message_id BIGINT UNSIGNED NULL AFTER image_public_id,
                    ADD KEY chat_message_reply (reply_to_message_id)'
            );
        }
    }

    public function down()
    {
        if ($this->has_column('chat_messages', 'reply_to_message_id')) {
            $this->_lava->db->raw(
                'ALTER TABLE chat_messages
                    DROP KEY chat_message_reply,
                    DROP COLUMN reply_to_message_id'
            );
        }
    }
}
