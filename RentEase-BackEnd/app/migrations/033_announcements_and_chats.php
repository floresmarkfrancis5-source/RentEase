<?php

class Announcements_and_chats
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;
        $db->raw(
            "CREATE TABLE IF NOT EXISTS landlord_announcements (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                landlord_id INT UNSIGNED NOT NULL,
                title VARCHAR(160) NOT NULL,
                body TEXT NOT NULL,
                is_published TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY announcement_homepage (landlord_id, is_published, created_at, id),
                CONSTRAINT fk_announcement_landlord FOREIGN KEY (landlord_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->raw(
            "CREATE TABLE IF NOT EXISTS chat_conversations (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                landlord_id INT UNSIGNED NOT NULL,
                tenant_id INT UNSIGNED NULL,
                conversation_type ENUM('general','direct') NOT NULL,
                room_key VARCHAR(64) NOT NULL,
                created_by INT UNSIGNED NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY chat_room_key (room_key),
                KEY chat_landlord_updated (landlord_id, updated_at, id),
                KEY chat_direct_tenant (tenant_id, landlord_id),
                CONSTRAINT fk_chat_landlord FOREIGN KEY (landlord_id) REFERENCES users (id) ON DELETE CASCADE,
                CONSTRAINT fk_chat_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
                CONSTRAINT fk_chat_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->raw(
            "CREATE TABLE IF NOT EXISTS chat_members (
                conversation_id BIGINT UNSIGNED NOT NULL,
                user_id INT UNSIGNED NOT NULL,
                cleared_through_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
                is_hidden TINYINT(1) NOT NULL DEFAULT 0,
                joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (conversation_id, user_id),
                KEY chat_member_user (user_id, conversation_id),
                CONSTRAINT fk_chat_member_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
                CONSTRAINT fk_chat_member_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->raw(
            "CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                conversation_id BIGINT UNSIGNED NOT NULL,
                sender_id INT UNSIGNED NOT NULL,
                content TEXT NULL,
                image_url VARCHAR(1000) NULL,
                image_public_id VARCHAR(255) NULL,
                is_unsent TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY chat_message_history (conversation_id, id),
                KEY chat_message_sender (sender_id, id),
                CONSTRAINT fk_chat_message_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
                CONSTRAINT fk_chat_message_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->raw(
            "CREATE TABLE IF NOT EXISTS chat_reactions (
                message_id BIGINT UNSIGNED NOT NULL,
                user_id INT UNSIGNED NOT NULL,
                reaction ENUM('like','dislike') NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id, user_id),
                KEY chat_reaction_user (user_id, message_id),
                CONSTRAINT fk_chat_reaction_message FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
                CONSTRAINT fk_chat_reaction_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw('DROP TABLE IF EXISTS chat_reactions');
        $db->raw('DROP TABLE IF EXISTS chat_messages');
        $db->raw('DROP TABLE IF EXISTS chat_members');
        $db->raw('DROP TABLE IF EXISTS chat_conversations');
        $db->raw('DROP TABLE IF EXISTS landlord_announcements');
    }
}
