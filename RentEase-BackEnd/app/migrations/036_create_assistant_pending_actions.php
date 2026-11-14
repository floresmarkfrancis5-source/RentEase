<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Store backend-controlled, expiring Assistant actions awaiting user confirmation. */
class Create_assistant_pending_actions
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
        $this->_lava->call->dbforge();
    }

    public function up()
    {
        $this->_lava->dbforge
            ->add_field([
                'id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'auto_increment' => TRUE,
                    'null' => FALSE,
                ],
                'conversation_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => FALSE,
                ],
                'landlord_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => FALSE,
                ],
                'created_message_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => FALSE,
                ],
                'tool' => [
                    'type' => 'VARCHAR',
                    'constraint' => 40,
                    'null' => FALSE,
                ],
                'args_json' => [
                    'type' => 'JSON',
                    'null' => FALSE,
                ],
                'status' => [
                    'type' => 'VARCHAR',
                    'constraint' => 20,
                    'null' => FALSE,
                    'default' => 'pending',
                ],
                'expires_at' => [
                    'type' => 'DATETIME',
                    'null' => FALSE,
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                    'null' => FALSE,
                    'default' => 'CURRENT_TIMESTAMP',
                ],
            ])
            ->add_key('id', primary: TRUE)
            ->add_key(['landlord_id', 'conversation_id', 'status', 'expires_at'], name: 'assistant_pending_owner')
            ->add_key('created_message_id', name: 'assistant_pending_user_message')
            ->create_table('assistant_pending_actions');
    }

    public function down()
    {
        $this->_lava->dbforge->drop_table('assistant_pending_actions', TRUE);
    }
}
