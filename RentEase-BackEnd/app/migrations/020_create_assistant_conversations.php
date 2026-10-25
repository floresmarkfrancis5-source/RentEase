<?php

/**
 * RentEase - persistent landlord AI assistant conversations.
 */
class Create_assistant_conversations
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $this->_lava->db->raw(
            "CREATE TABLE IF NOT EXISTS assistant_conversations (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id INT UNSIGNED NOT NULL,
                title VARCHAR(120) NOT NULL DEFAULT 'New conversation',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY assistant_conversation_user_updated (user_id, updated_at, id),
                CONSTRAINT fk_assistant_conversation_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $this->_lava->db->raw(
            "CREATE TABLE IF NOT EXISTS assistant_messages (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                conversation_id INT UNSIGNED NOT NULL,
                role ENUM('user', 'assistant') NOT NULL,
                content MEDIUMTEXT NOT NULL,
                proposal_json JSON DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY assistant_message_conversation (conversation_id, id),
                CONSTRAINT fk_assistant_message_conversation FOREIGN KEY (conversation_id) REFERENCES assistant_conversations (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS assistant_messages');
        $this->_lava->db->raw('DROP TABLE IF EXISTS assistant_conversations');
    }
}
