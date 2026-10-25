<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * SettingsController - website name, theme colors, hero content, glass look.
 *   GET  /api/settings                  public   (the whole site reads it to theme itself)
 *   PUT  /api/admin/settings            admin
 *   POST /api/admin/settings/reset      admin
 *   GET  /api/admin/settings/history    admin
 */
class SettingsController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Site_setting_model');
    }

    public function show()
    {
        $this->api->require_method('GET');
        header('Cache-Control: no-cache');
        $this->ok(['data' => $this->Site_setting_model->get_all()]);
    }

    public function update()
    {
        $this->api->require_method('PUT');
        [$clean, $errors] = $this->Site_setting_model->validate($this->input());

        if ($errors) {
            $this->fail('Validation failed', 422, $errors);
        }
        if (!$clean) {
            $this->fail('No valid settings supplied', 400);
        }
        $changed = $this->Site_setting_model->save($clean, $this->uid());
        $this->ok(['message' => $changed ? 'Settings saved' : 'Nothing changed', 'changed' => $changed, 'data' => $this->Site_setting_model->get_all()]);
    }

    public function reset()
    {
        $this->api->require_method('POST');
        $changed = $this->Site_setting_model->reset($this->uid());
        $this->ok(['message' => 'Settings restored to defaults', 'changed' => $changed, 'data' => $this->Site_setting_model->get_all()]);
    }

    public function history()
    {
        $this->api->require_method('GET');
        $rows = $this->db->raw(
            "SELECT l.setting_key, l.old_value, l.new_value, l.changed_at, u.username AS changed_by
               FROM site_settings_log l LEFT JOIN users u ON u.id = l.changed_by ORDER BY l.id DESC LIMIT 50"
        )->fetchAll(PDO::FETCH_ASSOC);
        $this->ok(['data' => $rows]);
    }

    /**
     * PUT /api/admin/settings/image   { "key": "logo|hero|login", "image": "data:image/webp;base64,..." }
     * The browser shrinks the picture first; the server still re-checks type, size and dimensions.
     */
    public function image_upload()
    {
        $this->api->require_method('PUT');
        $this->call->model('Site_asset_model');

        $raw = json_decode((string) file_get_contents('php://input'), true);
        $key = is_array($raw) ? (string) ($raw['key'] ?? '') : '';
        [$bin, $mime, $err] = $this->Site_asset_model->decode_data_url($key, is_array($raw) ? ($raw['image'] ?? null) : null);
        if ($err) {
            $this->fail($err, 422, ['image' => $err]);
        }

        $this->Site_asset_model->put($key, $mime, $bin, $this->uid());
        $setting = Site_asset_model::KEYS[$key]['setting'];
        $this->Site_setting_model->save([$setting => '/api/assets/' . $key . '?v=' . time()], $this->uid());

        $this->ok(['message' => 'Image saved', 'data' => $this->Site_setting_model->get_all()]);
    }

    /** DELETE /api/admin/settings/image/{key} */
    public function image_delete($key)
    {
        $this->api->require_method('DELETE');
        $this->call->model('Site_asset_model');
        if (!isset(Site_asset_model::KEYS[$key])) {
            $this->fail('Unknown image slot.', 404);
        }
        $this->Site_asset_model->remove($key);
        $this->Site_setting_model->save([Site_asset_model::KEYS[$key]['setting'] => ''], $this->uid());
        $this->ok(['message' => 'Image removed', 'data' => $this->Site_setting_model->get_all()]);
    }
}
