<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** MaintenanceController (admin) - see all repair requests and update their status (e-mails the tenant). */
class MaintenanceController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Maintenance_model', 'Maintenance_image_model']);
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q = $this->api->get_query_params();
        $f = in_array($q['status'] ?? '', ['pending', 'in_progress', 'resolved'], true) ? ['status' => $q['status']] : [];
        $f['landlord_id'] = $this->uid();
        $rows = $this->Maintenance_model->list_requests($f);
        if (!empty($rows)) {
            $ids = array_column($rows, 'id');
            $imgs = $this->Maintenance_image_model->list_for_requests($ids);
            foreach ($rows as &$r) {
                $r['images'] = $imgs[$r['id']] ?? [];
            }
            unset($r);
        }
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function image_show($id)
    {
        $this->api->require_method('GET');
        $img = $this->Maintenance_image_model->find($id);
        if (!$img) {
            $this->fail('Image not found', 404);
        }

        // Authorization check: Must be the tenant of this request, the landlord of this property, or a superadmin
        $uid = $this->uid();
        $user = $this->user();
        $is_owner_tenant = (int) ($img['tenant_id'] ?? 0) === $uid;
        $is_landlord     = (int) ($img['landlord_id'] ?? 0) === $uid;
        $is_superadmin   = ($user['role'] ?? '') === 'superadmin';

        if (!$is_owner_tenant && !$is_landlord && !$is_superadmin) {
            $this->fail('Forbidden', 403);
        }

        // If hosted on Cloudinary CDN, redirect directly for high-speed edge delivery
        if (!empty($img['image_url'])) {
            header('Location: ' . $img['image_url'], true, 302);
            exit;
        }

        header('Content-Type: ' . $img['mime']);
        header('Content-Length: ' . strlen($img['data']));
        header('Content-Disposition: inline; filename="' . rawurlencode($img['file_name']) . '"');
        header('Cache-Control: private, max-age=86400');
        header('X-Content-Type-Options: nosniff');
        echo $img['data'];
        exit;
    }

    public function update($id)
    {
        $old  = $this->not_found_unless($this->Maintenance_model->find($id, $this->uid()), 'Request');
        $in   = $this->input();
        $data = $this->validate($in, [
            'status'      => ['type' => 'enum', 'values' => ['pending', 'in_progress', 'resolved']],
            'admin_notes' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ], true);

        $this->Maintenance_model->update_request($id, $data);

        // Process attached landlord resolution/proof images
        $raw_images = is_array($in['images'] ?? null) ? $in['images'] : [];
        $added_count = 0;
        foreach ($raw_images as $img) {
            $data_url = is_array($img) ? ($img['data'] ?? null) : (is_string($img) ? $img : null);
            $file_name = is_array($img) ? ($img['name'] ?? null) : 'resolution_proof.jpg';
            if (!$data_url) continue;

            [$binary, $mime, $err] = $this->Maintenance_image_model->decode_image($data_url);
            if ($binary && $mime && !$err) {
                $this->Maintenance_image_model->create($id, $file_name, $mime, $binary, $this->uid(), 'landlord', $data_url);
                $added_count++;
            }
        }

        $new = $this->Maintenance_model->find($id, $this->uid());
        if ($new['status'] !== $old['status'] || ($new['admin_notes'] ?? '') !== ($old['admin_notes'] ?? '') || $added_count > 0) {
            $this->call->library('notifier');
            $this->notifier->maintenance_update($id);
        }
        $new['images'] = $this->Maintenance_image_model->list_for_request($id);
        $this->ok(['message' => 'Request updated' . ($added_count > 0 ? ' with resolution photos' : ''), 'data' => $new]);
    }

    public function delete($id)
    {
        $this->api->require_method('DELETE');
        $deleted = $this->Maintenance_model->delete_request($id, null, $this->uid());
        if (!$deleted) {
            $this->fail('Maintenance request not found or unauthorized.', 404);
        }
        $this->ok(['message' => 'Maintenance request deleted.']);
    }
}
