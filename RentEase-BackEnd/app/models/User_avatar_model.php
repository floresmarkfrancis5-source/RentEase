<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * User_avatar_model - profile pictures (table: user_avatars), one row per user.
 * The browser shrinks the picture to a small square first; the server re-checks everything.
 */
class User_avatar_model extends Model
{
    protected $table = 'user_avatars';

    public const MIMES     = ['image/png', 'image/jpeg', 'image/webp'];
    public const MAX_BYTES = 300 * 1024;
    public const MAX_SIDE  = 4000;

    /** @return array [binary|null, mime|null, error|null] */
    public function decode_data_url($data_url)
    {
        if (!is_string($data_url) || !preg_match('#^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$#', $data_url, $m)) {
            return [null, null, 'Upload a PNG, JPG or WebP picture.'];
        }
        $bin = base64_decode($m[2], true);
        if ($bin === false || $bin === '') {
            return [null, null, 'The picture could not be read.'];
        }
        if (strlen($bin) > self::MAX_BYTES) {
            return [null, null, 'The picture is too large (max ' . round(self::MAX_BYTES / 1024) . ' KB).'];
        }
        $info = @getimagesizefromstring($bin);   // trust the bytes, not the label
        if (!$info || !in_array($info['mime'], self::MIMES, true) || $info['mime'] !== $m[1]) {
            return [null, null, 'That file is not a valid PNG, JPG or WebP image.'];
        }
        if ($info[0] > self::MAX_SIDE || $info[1] > self::MAX_SIDE || $info[0] < 1 || $info[1] < 1) {
            return [null, null, 'The picture dimensions are not supported.'];
        }
        return [$bin, $info['mime'], null];
    }

    public function put($user_id, $mime, $binary)
    {
        $this->db->raw(
            'INSERT INTO user_avatars (user_id, mime, data, byte_size) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), byte_size = VALUES(byte_size)',
            [(int) $user_id, $mime, $binary, strlen($binary)]
        );
    }

    public function get($user_id)
    {
        $row = $this->db->raw('SELECT mime, data, byte_size, UNIX_TIMESTAMP(updated_at) AS ts FROM user_avatars WHERE user_id = ? LIMIT 1', [(int) $user_id])
            ->fetch(PDO::FETCH_ASSOC);
        if ($row && is_resource($row['data'])) {
            $row['data'] = stream_get_contents($row['data']);
        }
        return $row ?: null;
    }

    public function exists($user_id)
    {
        return (bool) $this->db->raw('SELECT 1 FROM user_avatars WHERE user_id = ? LIMIT 1', [(int) $user_id])->fetchColumn();
    }

    public function remove($user_id)
    {
        $this->db->raw('DELETE FROM user_avatars WHERE user_id = ?', [(int) $user_id]);
    }
}
