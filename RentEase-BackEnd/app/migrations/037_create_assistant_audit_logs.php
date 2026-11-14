<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Audit Assistant-initiated writes without storing secrets or credentials. */
class Create_assistant_audit_logs
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
                    'type' => 'BIGINT',
                    'unsigned' => TRUE,
                    'auto_increment' => TRUE,
                    'null' => FALSE,
                ],
                'landlord_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => FALSE,
                ],
                'conversation_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => TRUE,
                ],
                'user_message_id' => [
                    'type' => 'INT',
                    'unsigned' => TRUE,
                    'null' => TRUE,
                ],
                'operation' => [
                    'type' => 'VARCHAR',
                    'constraint' => 20,
                    'null' => FALSE,
                ],
                'entity' => [
                    'type' => 'VARCHAR',
                    'constraint' => 40,
                    'null' => FALSE,
                ],
                'entity_id' => [
                    'type' => 'BIGINT',
                    'unsigned' => TRUE,
                    'null' => FALSE,
                ],
                'before_json' => [
                    'type' => 'JSON',
                    'null' => TRUE,
                ],
                'after_json' => [
                    'type' => 'JSON',
                    'null' => TRUE,
                ],
                'created_at' => [
                    'type' => 'DATETIME',
                    'null' => FALSE,
                    'default' => 'CURRENT_TIMESTAMP',
                ],
            ])
            ->add_key('id', primary: TRUE)
            ->add_key(['landlord_id', 'created_at'], name: 'assistant_audit_owner')
            ->add_key(['entity', 'entity_id'], name: 'assistant_audit_entity')
            ->create_table('assistant_audit_logs');
    }

    public function down()
    {
        $this->_lava->dbforge->drop_table('assistant_audit_logs', TRUE);
    }
}
