<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Site_setting_model
 *
 * Key/value store for admin-editable branding, theme colors and hero content.
 * SCHEMA is the single source of truth: allowed keys, validation, defaults.
 * Unknown keys sent by a client are ignored, so nothing else can be written.
 */
class Site_setting_model extends Model
{
    protected $table = 'site_settings';

    /** type: text | color | url | enum | int */
    public const SCHEMA = [
        // ---- branding ----
        'site_name'       => ['group' => 'branding',   'type' => 'text',  'max' => 60,  'required' => true,  'default' => 'RentEase'],
        'site_tagline'    => ['group' => 'branding',   'type' => 'text',  'max' => 120, 'default' => 'Rental billing, made effortless'],
        'logo_url'        => ['group' => 'branding',   'type' => 'url',   'max' => 500, 'default' => ''],
        'footer_text'     => ['group' => 'branding',   'type' => 'text',  'max' => 200, 'default' => 'Built for landlords and tenants of apartments and boarding houses.'],
        // ---- colors ----
        'accent_color'    => ['group' => 'colors',     'type' => 'color', 'default' => '#7c4fe0'],
        'header_color'    => ['group' => 'colors',     'type' => 'color', 'default' => '#0d0817'],
        'hero_color_from' => ['group' => 'colors',     'type' => 'color', 'default' => '#5a2fb8'],
        'hero_color_to'   => ['group' => 'colors',     'type' => 'color', 'default' => '#1a0f2c'],
        // ---- hero ----
        'hero_title'      => ['group' => 'hero',       'type' => 'text',  'max' => 90,  'required' => true, 'default' => 'Rent collection, without the notebook.'],
        'hero_subtitle'   => ['group' => 'hero',       'type' => 'text',  'max' => 220, 'default' => 'Units, tenants, monthly billing, online payments and repair requests — in one calm, centralized place.'],
        'hero_cta_text'   => ['group' => 'hero',       'type' => 'text',  'max' => 30,  'default' => 'Get started'],
        'hero_image_url'  => ['group' => 'hero',       'type' => 'url',   'max' => 500, 'default' => ''],
        'login_image_url' => ['group' => 'hero',       'type' => 'url',   'max' => 500, 'default' => ''],
        // ---- appearance ----
        'default_theme'   => ['group' => 'appearance', 'type' => 'enum',  'values' => ['light', 'dark', 'system'], 'default' => 'system'],
        'glass_blur'      => ['group' => 'appearance', 'type' => 'int',   'min' => 0,  'max' => 40, 'default' => '18'],
        'glass_opacity'   => ['group' => 'appearance', 'type' => 'int',   'min' => 20, 'max' => 90, 'default' => '55'],
    ];

    /** @return array<string,string> every setting, falling back to defaults for missing rows */
    public function get_all()
    {
        $out = [];
        foreach (self::SCHEMA as $key => $def) {
            $out[$key] = (string) $def['default'];
        }

        $rows = $this->db->table($this->table)
            ->select('setting_key, setting_value')
            ->get_all(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            if (isset(self::SCHEMA[$row['setting_key']]) && $row['setting_value'] !== null) {
                $out[$row['setting_key']] = (string) $row['setting_value'];
            }
        }
        return $out;
    }

    /** @return array<int,array<string,mixed>> */
    public function history()
    {
        return $this->db->raw(
            "SELECT l.setting_key, l.old_value, l.new_value, l.changed_at, u.username AS changed_by
               FROM site_settings_log l LEFT JOIN users u ON u.id = l.changed_by ORDER BY l.id DESC LIMIT 50"
        )->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Validate + normalise client input. Only keys present in SCHEMA are looked at.
     *
     * @return array{0: array<string,string>, 1: array<string,string>} [clean, errors]
     */
    public function validate(array $input)
    {
        $clean  = [];
        $errors = [];

        foreach (self::SCHEMA as $key => $def) {
            if (!array_key_exists($key, $input)) {
                continue;
            }
            $raw = $input[$key];
            if (!is_scalar($raw) && $raw !== null) {
                $errors[$key] = 'Invalid value.';
                continue;
            }
            $value = trim(strip_tags((string) $raw));

            if (($def['required'] ?? false) && $value === '') {
                $errors[$key] = 'This field is required.';
                continue;
            }

            switch ($def['type']) {
                case 'text':
                    if (mb_strlen($value) > $def['max']) {
                        $errors[$key] = "Maximum {$def['max']} characters.";
                        continue 2;
                    }
                    break;

                case 'color':
                    if (!preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $value)) {
                        $errors[$key] = 'Use a hex color like #0f766e.';
                        continue 2;
                    }
                    if (strlen($value) === 4) {
                        $value = '#' . $value[1] . $value[1] . $value[2] . $value[2] . $value[3] . $value[3];
                    }
                    $value = strtolower($value);
                    break;

                case 'url':
                    if ($value !== '') {
                        // either an uploaded image served by this API (/api/assets/logo?v=123) or an http(s) link
                        $own = (bool) preg_match('#^/api/assets/(logo|hero|login)(\?v=\d{1,12})?$#', $value);
                        $ok = $own || (filter_var($value, FILTER_VALIDATE_URL)
                           && preg_match('#^https?://#i', $value)
                           && mb_strlen($value) <= $def['max']);
                        if (!$ok) {
                            $errors[$key] = 'Upload an image or enter a valid http(s) image link.';
                            continue 2;
                        }
                    }
                    break;

                case 'enum':
                    if (!in_array($value, $def['values'], true)) {
                        $errors[$key] = 'Must be one of: ' . implode(', ', $def['values']) . '.';
                        continue 2;
                    }
                    break;

                case 'int':
                    if (!preg_match('/^\d+$/', $value) || (int) $value < $def['min'] || (int) $value > $def['max']) {
                        $errors[$key] = "Whole number between {$def['min']} and {$def['max']}.";
                        continue 2;
                    }
                    $value = (string) (int) $value;
                    break;
            }

            $clean[$key] = $value;
        }

        return [$clean, $errors];
    }

    /**
     * Persist validated values and write one audit row per value that actually changed.
     *
     * @param array<string,string> $clean
     * @return array<int,string> keys that changed
     */
    public function save(array $clean, $user_id)
    {
        $current = $this->get_all();
        $changed = [];

        $this->db->transaction();
        try {
            foreach ($clean as $key => $value) {
                if (($current[$key] ?? null) === $value) {
                    continue;
                }
                $this->db->raw(
                    "INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_by)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)",
                    [$key, $value, self::SCHEMA[$key]['group'], $user_id]
                );
                $this->db->raw(
                    'INSERT INTO site_settings_log (setting_key, old_value, new_value, changed_by) VALUES (?, ?, ?, ?)',
                    [$key, $current[$key] ?? null, $value, $user_id]
                );
                $changed[] = $key;
            }
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
        return $changed;
    }

    /** Restore every setting to its default value. */
    public function reset($user_id)
    {
        $defaults = [];
        foreach (self::SCHEMA as $key => $def) {
            $defaults[$key] = (string) $def['default'];
        }
        return $this->save($defaults, $user_id);
    }
}
