<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Site_asset_model - images the admin uploads for the site (logo, homepage hero, login image).
 * KEYS maps the asset key to the site setting that holds its public URL.
 */
class Site_asset_model extends Model
{
    protected $table = 'site_assets';

    public const KEYS = [
        'logo'  => ['setting' => 'logo_url',        'max_bytes' => 400 * 1024],
        'hero'  => ['setting' => 'hero_image_url',  'max_bytes' => 2500 * 1024],
        'login' => ['setting' => 'login_image_url', 'max_bytes' => 2500 * 1024],
    ];
    public const MIMES = ['image/png', 'image/jpeg', 'image/webp'];
    public const MAX_SIDE = 6000;

    /**
     * Validate a "data:image/...;base64,..." string.
     * @return array [binary|null, mime|null, error|null]
     */
    public function decode_data_url($key, $data_url)
    {
        if (!isset(self::KEYS[$key])) {
            return [null, null, 'Unknown image slot.'];
        }
        if (!is_string($data_url) || !preg_match('#^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$#', $data_url, $m)) {
            return [null, null, 'Upload a PNG, JPG or WebP image.'];
        }
        $bin = base64_decode($m[2], true);
        if ($bin === false || $bin === '') {
            return [null, null, 'The image could not be read.'];
        }
        if (strlen($bin) > self::KEYS[$key]['max_bytes']) {
            return [null, null, 'The image is too large (max ' . round(self::KEYS[$key]['max_bytes'] / 1024) . ' KB after compression).'];
        }
        // Trust the bytes, not the label: the real file type must be one we allow and match the declared one.
        $info = @getimagesizefromstring($bin);
        if (!$info || !in_array($info['mime'], self::MIMES, true) || $info['mime'] !== $m[1]) {
            return [null, null, 'That file is not a valid PNG, JPG or WebP image.'];
        }
        if ($info[0] > self::MAX_SIDE || $info[1] > self::MAX_SIDE || $info[0] < 1 || $info[1] < 1) {
            return [null, null, 'The image dimensions are not supported.'];
        }
        return [$bin, $info['mime'], null];
    }

    public function put($key, $mime, $binary, $user_id)
    {
        $this->db->raw(
            'INSERT INTO site_assets (asset_key, mime, data, byte_size, updated_by) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), byte_size = VALUES(byte_size), updated_by = VALUES(updated_by)',
            [$key, $mime, $binary, strlen($binary), (int) $user_id]
        );
    }

    /** @return array|null ['mime' => , 'data' => , 'byte_size' => , 'updated_at' => ] */
    public function get($key)
    {
        $row = $this->db->raw('SELECT mime, data, byte_size, UNIX_TIMESTAMP(updated_at) AS ts FROM site_assets WHERE asset_key = ? LIMIT 1', [$key])
            ->fetch(PDO::FETCH_ASSOC);
        if ($row && is_resource($row['data'])) {
            $row['data'] = stream_get_contents($row['data']);
        }
        return $row ?: null;
    }

    public function remove($key)
    {
        $this->db->raw('DELETE FROM site_assets WHERE asset_key = ?', [$key]);
    }
}
