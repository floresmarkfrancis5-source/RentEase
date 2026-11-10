<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Private PDF attachments associated with landlord-owned lease records. */
class Lease_document_model extends Model
{
    protected $table = 'lease_documents';
    public const MAX_BYTES = 5 * 1024 * 1024;

    public function list_for_lease($lease_id)
    {
        return $this->db->table($this->table)
            ->select('id, original_name, mime, byte_size, created_at')
            ->where('lease_id', (int) $lease_id)
            ->order_by('created_at', 'DESC')
            ->get_all(PDO::FETCH_ASSOC);
    }

    public function decode_pdf($data_url)
    {
        if (!is_string($data_url) || !preg_match('#^data:application/pdf;base64,([A-Za-z0-9+/]+={0,2})$#', $data_url, $match)) {
            return [null, 'Choose a valid lease document file.'];
        }
        $binary = base64_decode($match[1], true);
        if ($binary === false || $binary === '' || strlen($binary) > self::MAX_BYTES) {
            return [null, 'Lease documents must be no larger than 5 MB.'];
        }
        if (substr($binary, 0, 5) !== '%PDF-') {
            return [null, 'This lease document file is not supported.'];
        }
        return [$binary, null];
    }

    public function create($lease_id, $uploaded_by, $name, $binary)
    {
        $this->db->table($this->table)->insert([
            'lease_id' => (int) $lease_id,
            'uploaded_by' => (int) $uploaded_by,
            'original_name' => $name,
            'mime' => 'application/pdf',
            'data' => $binary,
            'byte_size' => strlen($binary),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function find_for_landlord($lease_id, $document_id, $landlord_id)
    {
        $row = $this->db->raw(
            'SELECT d.id, d.original_name, d.mime, d.data, d.byte_size
               FROM lease_documents d
               JOIN leases l ON l.id = d.lease_id
               JOIN units u ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE d.id = ? AND d.lease_id = ? AND p.owner_id = ? LIMIT 1',
            [(int) $document_id, (int) $lease_id, (int) $landlord_id]
        )->fetch(PDO::FETCH_ASSOC);
        if ($row && is_resource($row['data'])) {
            $row['data'] = stream_get_contents($row['data']);
        }
        return $row ?: null;
    }

    public function delete($lease_id, $document_id)
    {
        return $this->db->table($this->table)
            ->where('id', (int) $document_id)
            ->where('lease_id', (int) $lease_id)
            ->delete();
    }
}
