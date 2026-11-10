<?php

/**
 * Migration 028: isolate appearance settings and uploaded assets by landlord.
 * Existing global rows are retained but are no longer used for landlord settings.
 */
class Scope_site_settings_per_landlord
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
    }

    public function up()
    {
        $db = $this->_lava->db;

        $columns = [
            'site_settings' => 'owner_id',
            'site_settings_log' => 'owner_id',
            'site_assets' => 'owner_id',
        ];
        foreach ($columns as $table => $column) {
            $exists = $db->raw(
                'SELECT COUNT(*) FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                [$table, $column]
            )->fetchColumn();
            if (!(int) $exists) {
                $db->raw("ALTER TABLE {$table} ADD COLUMN owner_id INT UNSIGNED NULL");
            }
        }

        $settingsIndex = $db->raw(
            "SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND INDEX_NAME = 'uq_site_settings_key'"
        )->fetchColumn();
        if ((int) $settingsIndex) {
            $db->raw('ALTER TABLE site_settings DROP INDEX uq_site_settings_key');
        }
        $scopedSettingsIndex = $db->raw(
            "SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_settings' AND INDEX_NAME = 'uq_site_settings_owner_key'"
        )->fetchColumn();
        if (!(int) $scopedSettingsIndex) {
            $db->raw('ALTER TABLE site_settings ADD UNIQUE KEY uq_site_settings_owner_key (owner_id, setting_key)');
        }

        $assetPrimary = $db->raw(
            "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_assets' AND CONSTRAINT_TYPE = 'PRIMARY KEY'"
        )->fetchColumn();
        $assetId = $db->raw(
            "SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_assets' AND COLUMN_NAME = 'id'"
        )->fetchColumn();
        if ((int) $assetPrimary && !(int) $assetId) {
            $db->raw('ALTER TABLE site_assets DROP PRIMARY KEY, ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST');
        }
        $assetIndex = $db->raw(
            "SELECT COUNT(*) FROM information_schema.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_assets' AND INDEX_NAME = 'uq_site_assets_owner_key'"
        )->fetchColumn();
        if (!(int) $assetIndex) {
            $db->raw('ALTER TABLE site_assets ADD UNIQUE KEY uq_site_assets_owner_key (owner_id, asset_key)');
        }

        $db->raw(
            "ALTER TABLE site_settings
             ADD CONSTRAINT fk_site_settings_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE"
        );
        $db->raw(
            "ALTER TABLE site_settings_log
             ADD KEY idx_settings_log_owner_time (owner_id, changed_at),
             ADD CONSTRAINT fk_settings_log_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE"
        );
        $db->raw(
            "ALTER TABLE site_assets
             ADD CONSTRAINT fk_site_assets_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE"
        );
    }

    public function down()
    {
        $db = $this->_lava->db;
        $db->raw('ALTER TABLE site_assets DROP FOREIGN KEY fk_site_assets_owner, DROP INDEX uq_site_assets_owner_key, DROP PRIMARY KEY, DROP COLUMN id, ADD PRIMARY KEY (asset_key)');
        $db->raw('ALTER TABLE site_settings_log DROP FOREIGN KEY fk_settings_log_owner, DROP INDEX idx_settings_log_owner_time, DROP COLUMN owner_id');
        $db->raw('ALTER TABLE site_settings DROP FOREIGN KEY fk_site_settings_owner, DROP INDEX uq_site_settings_owner_key, DROP COLUMN owner_id, ADD UNIQUE KEY uq_site_settings_key (setting_key)');
    }
}
