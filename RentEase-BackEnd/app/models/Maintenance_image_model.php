<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Maintenance_image_model - attached photos/screenshots for repair requests (table: maintenance_images).
 * Binary data stored in MEDIUMBLOB; metadata cached in list queries.
 */
class Maintenance_image_model extends Model
{
    protected $table = 'maintenance_images';
    public const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per image
    public const ALLOWED_MIMES = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
    ];

    /**
     * Decode a base64 data URL into binary bytes, mime, and error string if any.
     * @param string|null $data_url
     * @return array [binary|null, mime|null, error|null]
     */
    public function decode_image($data_url)
    {
        if (!is_string($data_url) || !preg_match('#^data:(image/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$#', $data_url, $m)) {
            return [null, null, 'Upload a valid image (PNG, JPG, WebP, or GIF).'];
        }
        $mime = $m[1];
        $binary = base64_decode($m[2], true);
        if ($binary === false || $binary === '') {
            return [null, null, 'The image could not be read or is corrupted.'];
        }
        if (strlen($binary) > self::MAX_BYTES) {
            return [null, null, 'Image size exceeds the 10 MB limit.'];
        }
        // Verify image bytes
        $info = @getimagesizefromstring($binary);
        if (!$info || !isset(self::ALLOWED_MIMES[$info['mime']])) {
            return [null, null, 'The file content is not a valid image format.'];
        }
        return [$binary, $info['mime'], null];
    }

    public function create($request_id, $file_name, $mime, $binary, $uploaded_by = null, $uploader_role = 'tenant', $data_url = null)
    {
        $safe_name = preg_replace('/[^\pL\pN._ -]/u', '_', basename(str_replace('\\', '/', (string) $file_name)));
        if ($safe_name === '' || $safe_name === '.') {
            $ext = self::ALLOWED_MIMES[$mime] ?? 'jpg';
            $safe_name = ($uploader_role === 'landlord' ? 'resolution_photo_' : 'repair_photo_') . time() . '.' . $ext;
        }

        // Try uploading to Cloudinary CDN
        $image_url = null;
        try {
            $cloudinary = $this->call->library('cloudinary');
            if (!$cloudinary || !method_exists($cloudinary, 'configured')) {
                $cloudinary = load_class('cloudinary', 'libraries');
            }
            if ($cloudinary && method_exists($cloudinary, 'configured') && $cloudinary->configured()) {
                $upload_src = $data_url ?: ('data:' . $mime . ';base64,' . base64_encode($binary));
                $upload_res = $cloudinary->upload($upload_src);
                if (!empty($upload_res['url'])) {
                    $image_url = $upload_res['url'];
                }
            }
        } catch (Throwable $e) {
            // Cloudinary upload failed; fallback to local BLOB storage
        }

        $this->db->table($this->table)->insert([
            'request_id'    => (int) $request_id,
            'uploaded_by'   => $uploaded_by ? (int) $uploaded_by : null,
            'uploader_role' => $uploader_role === 'landlord' ? 'landlord' : 'tenant',
            'file_name'     => mb_substr($safe_name, 0, 250),
            'mime'          => $mime,
            'byte_size'     => strlen($binary),
            'image_url'     => $image_url,
            'data'          => $image_url ? null : $binary,
            'created_at'    => date('Y-m-d H:i:s'),
        ]);

        return (int) $this->db->last_id();
    }

    public function list_for_request($request_id)
    {
        return $this->db->table($this->table)
            ->select('id, request_id, uploaded_by, uploader_role, file_name, mime, byte_size, image_url, created_at')
            ->where('request_id', (int) $request_id)
            ->order_by('id', 'ASC')
            ->get_all(PDO::FETCH_ASSOC);
    }

    /**
     * Batch fetch images for multiple maintenance requests, keyed by request_id.
     * @param int[] $request_ids
     * @return array<int, array>
     */
    public function list_for_requests(array $request_ids)
    {
        $ids = array_filter(array_map('intval', $request_ids));
        if (empty($ids)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = $this->db->raw(
            "SELECT id, request_id, uploaded_by, uploader_role, file_name, mime, byte_size, image_url, created_at
               FROM maintenance_images
              WHERE request_id IN ($placeholders)
           ORDER BY id ASC",
            $ids
        )->fetchAll(PDO::FETCH_ASSOC);

        $result = [];
        foreach ($rows as $row) {
            $result[$row['request_id']][] = $row;
        }
        return $result;
    }

    public function find($id)
    {
        $row = $this->db->raw(
            'SELECT i.id, i.request_id, i.uploaded_by, i.uploader_role, i.file_name, i.mime, i.byte_size, i.image_url, i.data, i.created_at,
                    m.tenant_id, p.owner_id AS landlord_id
               FROM maintenance_images i
               JOIN maintenance_requests m ON m.id = i.request_id
               JOIN units u ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE i.id = ? LIMIT 1',
            [(int) $id]
        )->fetch(PDO::FETCH_ASSOC);

        if ($row && is_resource($row['data'])) {
            $row['data'] = stream_get_contents($row['data']);
        }

        return $row ?: null;
    }

    public function delete($id)
    {
        return $this->db->table($this->table)->where('id', (int) $id)->delete();
    }
}
