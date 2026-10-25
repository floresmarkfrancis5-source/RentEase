<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** LeaseController (admin) - assign a tenant to a unit with rent, deposit and due day. */
class LeaseController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Lease_model', 'Unit_model', 'User_model', 'Lease_document_model']);
    }

    private function rules()
    {
        return [
            'unit_id'      => ['type' => 'int', 'required' => true, 'min' => 1],
            'tenant_id'    => ['type' => 'int', 'required' => true, 'min' => 1],
            'start_date'   => ['type' => 'date', 'required' => true],
            'end_date'     => ['type' => 'date', 'nullable' => true],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'deposit'      => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'due_day'      => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => 5],
        ];
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q    = $this->api->get_query_params();
        $rows = $this->Lease_model->list_leases(in_array($q['status'] ?? '', ['active', 'ended'], true) ? $q['status'] : null, $this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease')]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), $this->rules());

        $unit   = $this->Unit_model->available_for_lease($data['unit_id'], false, $this->uid());
        if (!$unit) {
            $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'Unit is unavailable.']);
        }
        $tenant = $this->User_model->find_tenant($data['tenant_id'], $this->uid());
        if (!$tenant || (int) $tenant['is_active'] !== 1) {
            $this->fail('Choose an active tenant account.', 422, ['tenant_id' => 'Tenant not found or inactive.']);
        }
        if (!empty($data['end_date']) && $data['end_date'] < $data['start_date']) {
            $this->fail('The end date must be after the start date.', 422, ['end_date' => 'Must be on or after the start date.']);
        }
        if (empty($data['monthly_rent'])) {
            $data['monthly_rent'] = (float) $unit['monthly_rent'];   // default: the unit's listed rent
        }
        $this->db->transaction();
        try {
            $unit = $this->Unit_model->available_for_lease($data['unit_id'], true, $this->uid());
            if (!$unit) {
                $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'Unit is no longer available.']);
            }
            $id = $this->Lease_model->create_lease_in_transaction($data, $this->uid());
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
        $this->ok(['message' => 'Lease created', 'data' => $this->Lease_model->find($id, $this->uid())], 201);
    }

    public function update($id)
    {
        $partial = $_SERVER['REQUEST_METHOD'] === 'PATCH';
        $lease   = $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        if ($lease['status'] !== 'active') {
            $this->fail('Ended leases are read-only. Create a new lease if the tenant returns.', 409);
        }
        // Unit, tenant and start date are immutable so existing billing history stays attached to its original term.
        $rules = array_diff_key($this->rules(), ['unit_id' => 1, 'tenant_id' => 1, 'start_date' => 1]);
        $rules['monthly_rent']['nullable'] = false;
        $data  = $this->validate($this->input(), $rules, $partial);

        $start = $data['start_date'] ?? $lease['start_date'];
        $end   = array_key_exists('end_date', $data) ? $data['end_date'] : $lease['end_date'];
        if ($end && $end < $start) {
            $this->fail('The end date must be after the start date.', 422, ['end_date' => 'Must be on or after the start date.']);
        }
        if (!$this->Lease_model->update_lease($id, $data, $this->uid())) {
            $this->fail('This lease is no longer active and cannot be edited.', 409);
        }
        $this->ok(['message' => 'Lease updated', 'data' => $this->Lease_model->find($id, $this->uid())]);
    }

    public function renew($id)
    {
        $this->api->require_method('POST');
        $lease = $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        if ($lease['status'] !== 'active') {
            $this->fail('Only active leases can be renewed.', 409);
        }
        $data = $this->validate($this->input(), [
            'end_date' => ['type' => 'date', 'required' => true],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'deposit' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'nullable' => true],
            'due_day' => ['type' => 'int', 'min' => 1, 'max' => 28, 'nullable' => true],
        ]);
        $minimum_date = $lease['end_date'] ?: date('Y-m-d');
        if ($data['end_date'] <= $minimum_date) {
            $this->fail('The renewed end date must be later than the current lease end date.', 422, [
                'end_date' => 'Choose a date after ' . $minimum_date . '.',
            ]);
        }
        foreach (['monthly_rent', 'deposit', 'due_day'] as $field) {
            if ($data[$field] === null) {
                unset($data[$field]);
            }
        }
        if (!$this->Lease_model->renew_lease($id, $data, $this->uid())) {
            $this->fail('The lease changed while it was being renewed. Reload and try again.', 409);
        }
        $this->ok(['message' => 'Lease renewed. Existing bills and lease history were preserved.', 'data' => $this->Lease_model->find($id, $this->uid())]);
    }

    public function history($id)
    {
        $this->api->require_method('GET');
        $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        $rows = $this->Lease_model->history($id);
        foreach ($rows as &$row) {
            $row['before_data'] = $row['before_data'] ? json_decode($row['before_data'], true) : null;
            $row['after_data'] = $row['after_data'] ? json_decode($row['after_data'], true) : null;
        }
        unset($row);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function documents($id)
    {
        $this->api->require_method('GET');
        $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        $rows = $this->Lease_document_model->list_for_lease($id);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function upload_document($id)
    {
        $this->api->require_method('POST');
        $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        $input = $this->input();
        $name = trim((string) ($input['name'] ?? 'lease-document.pdf'));
        $data_url = $input['document'] ?? null;
        if ($name === '' || mb_strlen($name) > 180 || preg_match('/[\x00-\x1F\x7F]/', $name)) {
            $this->fail('Use a valid document filename (maximum 180 characters).', 422, ['name' => 'Invalid filename.']);
        }
        if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'pdf') {
            $this->fail('Only PDF lease documents are supported.', 422, ['document' => 'Select a PDF file.']);
        }
        [$binary, $error] = $this->Lease_document_model->decode_pdf($data_url);
        if ($error) {
            $this->fail($error, 422, ['document' => $error]);
        }
        $safe_name = preg_replace('/[^\pL\pN._ -]/u', '_', basename(str_replace('\\', '/', $name)));
        $document_id = $this->Lease_document_model->create((int) $id, $this->uid(), $safe_name, $binary);
        $this->ok(['message' => 'Lease document uploaded.', 'data' => [
            'id' => $document_id,
            'original_name' => $safe_name,
            'mime' => 'application/pdf',
            'byte_size' => strlen($binary),
        ]], 201);
    }

    public function download_document($id, $document_id)
    {
        $this->api->require_method('GET');
        $row = $this->Lease_document_model->find_for_landlord($id, $document_id, $this->uid());
        $this->not_found_unless($row, 'Lease document');
        header('Content-Type: application/pdf');
        header('Content-Length: ' . strlen($row['data']));
        header('Content-Disposition: attachment; filename="lease-document.pdf"; filename*=UTF-8\'\'' . rawurlencode($row['original_name']));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo $row['data'];
        exit;
    }

    public function delete_document($id, $document_id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        if (!$this->Lease_document_model->delete($id, $document_id)) {
            $this->fail('Lease document not found.', 404);
        }
        $this->ok(['message' => 'Lease document deleted.']);
    }

    public function end($id)
    {
        $this->api->require_method('POST');
        $lease = $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        if ($lease['status'] !== 'active') {
            $this->fail('This lease has already ended.', 409);
        }
        if (!$this->Lease_model->end_lease($id, date('Y-m-d'), $this->uid())) {
            $this->fail('This lease has already ended.', 409);
        }
        $this->ok(['message' => 'Lease ended and the unit is vacant again', 'data' => $this->Lease_model->find($id, $this->uid())]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->Lease_model->find($id, $this->uid()), 'Lease');
        if ($this->Lease_model->has_bills($id)) {
            $this->fail('This lease already has bills. End the lease instead of deleting it.', 409);
        }
        $this->Lease_model->delete_lease($id);
        $this->ok(['message' => 'Lease deleted']);
    }
}
