<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** MaintenanceController (admin) - see all repair requests and update their status (e-mails the tenant). */
class MaintenanceController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Maintenance_model');
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q = $this->api->get_query_params();
        $f = in_array($q['status'] ?? '', ['pending', 'in_progress', 'resolved'], true) ? ['status' => $q['status']] : [];
        $f['landlord_id'] = $this->uid();
        $rows = $this->Maintenance_model->list_requests($f);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function update($id)
    {
        $old  = $this->not_found_unless($this->Maintenance_model->find($id, $this->uid()), 'Request');
        $data = $this->validate($this->input(), [
            'status'      => ['type' => 'enum', 'values' => ['pending', 'in_progress', 'resolved']],
            'priority'    => ['type' => 'enum', 'values' => ['low', 'medium', 'high']],
            'admin_notes' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ], true);

        $this->Maintenance_model->update_request($id, $data);

        $new = $this->Maintenance_model->find($id, $this->uid());
        if ($new['status'] !== $old['status'] || ($new['admin_notes'] ?? '') !== ($old['admin_notes'] ?? '')) {
            $this->call->library('notifier');
            $this->notifier->maintenance_update($id);
        }
        $this->ok(['message' => 'Request updated', 'data' => $new]);
    }
}
