<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * SettingsController - landlord-specific theme, tenant welcome page, sidebar logo, and glass look.
 *   GET  /api/settings                  public   (RentEase defaults)
 *   GET  /api/my/settings               signed-in landlord or tenant's landlord settings
 *   PUT  /api/admin/settings            admin
 *   POST /api/admin/settings/reset      admin
 *   GET  /api/admin/settings/history    admin
 */
class SettingsController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Site_setting_model', 'User_model']);
    }

    public function show()
    {
        $this->api->require_method('GET');
        header('Cache-Control: no-cache');
        $this->ok(['data' => $this->Site_setting_model->get_all()]);
    }

    public function show_for_user()
    {
        $this->api->require_method('GET');
        $user = $this->user();
        $owner_id = $user['role'] === 'tenant' ? (int) $user['landlord_id'] : (int) $user['id'];
        if (!in_array($user['role'], ['admin', 'tenant'], true) || $owner_id < 1) {
            $this->fail('Landlord settings are not available for this account.', 404);
        }
        header('Cache-Control: no-store');
        $landlord = $this->User_model->find_by_id($owner_id);
        $this->ok([
            'data' => $this->Site_setting_model->get_all($owner_id),
            'landlord' => $landlord ? [
                'full_name' => $landlord['full_name'],
                'email' => $landlord['email'],
                'phone' => $landlord['phone'],
            ] : null,
        ]);
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
        $changed = $this->Site_setting_model->save($clean, $this->uid(), $this->uid());
        $this->ok(['message' => $changed ? 'Settings saved' : 'Nothing changed', 'changed' => $changed, 'data' => $this->Site_setting_model->get_all($this->uid())]);
    }

    public function reset()
    {
        $this->api->require_method('POST');
        $appearanceDefaults = [];
        foreach (Site_setting_model::SCHEMA as $key => $definition) {
            if ($definition['group'] !== 'billing') {
                $appearanceDefaults[$key] = (string) $definition['default'];
            }
        }
        $changed = $this->Site_setting_model->save($appearanceDefaults, $this->uid(), $this->uid());
        $this->ok(['message' => 'Settings restored to defaults', 'changed' => $changed, 'data' => $this->Site_setting_model->get_all($this->uid())]);
    }

    public function history()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->Site_setting_model->history($this->uid())]);
    }

    /**
     * PUT /api/admin/settings/image   { "key": "logo|hero", "image": "data:image/webp;base64,..." }
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

        $this->Site_asset_model->put($key, $mime, $bin, $this->uid(), $this->uid());
        $setting = Site_asset_model::KEYS[$key]['setting'];
        $url = '/api/assets/' . $key . '?owner=' . $this->uid() . '&v=' . time();
        $this->Site_setting_model->save([$setting => $url], $this->uid(), $this->uid());

        $this->ok(['message' => 'Image saved', 'data' => $this->Site_setting_model->get_all($this->uid())]);
    }

    /** DELETE /api/admin/settings/image/{key} */
    public function image_delete($key)
    {
        $this->api->require_method('DELETE');
        $this->call->model('Site_asset_model');
        if (!isset(Site_asset_model::KEYS[$key])) {
            $this->fail('Unknown image slot.', 404);
        }
        $this->Site_asset_model->remove($key, $this->uid());
        $this->Site_setting_model->save([Site_asset_model::KEYS[$key]['setting'] => ''], $this->uid(), $this->uid());
        $this->ok(['message' => 'Image removed', 'data' => $this->Site_setting_model->get_all($this->uid())]);
    }
}
