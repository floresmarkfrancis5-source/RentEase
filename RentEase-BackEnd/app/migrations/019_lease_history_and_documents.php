<?php

/**
 * RentEase - lease term history and private PDF attachments.
 */
class Lease_history_and_documents
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $this->_lava->db->raw(
            "CREATE TABLE IF NOT EXISTS lease_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                lease_id INT UNSIGNED NOT NULL,
                actor_id INT UNSIGNED DEFAULT NULL,
                event_type VARCHAR(40) NOT NULL,
                summary VARCHAR(255) NOT NULL,
                before_data TEXT DEFAULT NULL,
                after_data TEXT DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY lease_events_history (lease_id, created_at, id),
                CONSTRAINT fk_lease_events_lease FOREIGN KEY (lease_id) REFERENCES leases (id) ON DELETE CASCADE,
                CONSTRAINT fk_lease_events_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $this->_lava->db->raw(
            "CREATE TABLE IF NOT EXISTS lease_documents (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                lease_id INT UNSIGNED NOT NULL,
                uploaded_by INT UNSIGNED DEFAULT NULL,
                original_name VARCHAR(180) NOT NULL,
                mime VARCHAR(40) NOT NULL,
                data LONGBLOB NOT NULL,
                byte_size INT UNSIGNED NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY lease_documents_lease (lease_id, created_at, id),
                CONSTRAINT fk_lease_documents_lease FOREIGN KEY (lease_id) REFERENCES leases (id) ON DELETE CASCADE,
                CONSTRAINT fk_lease_documents_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $this->_lava->db->raw(
            "INSERT INTO lease_events (lease_id, event_type, summary, after_data, created_at)
             SELECT id, 'created', 'Lease history tracking enabled for existing lease.',
                    JSON_OBJECT('unit_id', unit_id, 'tenant_id', tenant_id, 'start_date', start_date,
                                'end_date', end_date, 'monthly_rent', monthly_rent, 'deposit', deposit, 'due_day', due_day),
                    created_at
               FROM leases l
              WHERE NOT EXISTS (
                    SELECT 1 FROM lease_events e WHERE e.lease_id = l.id
              )"
        );
    }

    public function down()
    {
        $this->_lava->db->raw('DROP TABLE IF EXISTS lease_documents');
        $this->_lava->db->raw('DROP TABLE IF EXISTS lease_events');
    }
}
