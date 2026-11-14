<?php

class Add_haha_chat_reaction
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $this->_lava->db->raw(
            "ALTER TABLE chat_reactions
             MODIFY reaction ENUM('like','dislike','haha') NOT NULL"
        );
    }

    public function down()
    {
        $this->_lava->db->raw(
            "UPDATE chat_reactions SET reaction = 'like' WHERE reaction = 'haha'"
        );
        $this->_lava->db->raw(
            "ALTER TABLE chat_reactions
             MODIFY reaction ENUM('like','dislike') NOT NULL"
        );
    }
}
