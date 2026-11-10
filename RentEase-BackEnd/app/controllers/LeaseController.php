<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** LeaseController (admin) - assign a tenant to a unit with rent, deposit and due day. */
class LeaseController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Lease_model', 'Unit_model', 'User_model', 'Lease_document_model', 'Site_setting_model']);
    }

    private function rules()
    {
        return [
            'unit_id'      => ['type' => 'int',     'required' => true, 'min' => 1],
            'tenant_id'    => ['type' => 'int',     'required' => true, 'min' => 1],
            'start_date'   => ['type' => 'date',    'required' => true],
            'end_date'     => ['type' => 'date',    'nullable' => true],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'deposit'      => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'due_day'      => ['type' => 'int',     'min' => 1, 'max' => 28, 'nullable' => true],
            'billing_style' => ['type' => 'enum', 'values' => ['calendar', 'anniversary', 'first_of_month'], 'nullable' => true],
            'prorate_first_month' => ['type' => 'bool', 'nullable' => true],
            'grace_period_days' => ['type' => 'int', 'min' => 0, 'max' => 15, 'nullable' => true],
            'late_fee' => ['type' => 'decimal', 'min' => 0, 'max' => 999999.99, 'nullable' => true],
            'contract_term' => ['type' => 'enum', 'values' => ['monthly','annually','custom'], 'default' => 'annually'],
            'contract_months' => ['type' => 'int', 'min' => 1, 'max' => 120, 'nullable' => true],
            'advance_payment' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'down_payment' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'contract_required' => ['type' => 'bool', 'default' => false],
            'notes'        => ['type' => 'string',  'nullable' => true, 'max' => 1000],
        ];
    }

    public function index()
    {
        $this->api->require_method('GET');
        $this->Lease_model->sync_lifecycle();
        $q    = $this->api->get_query_params();
        $rows = $this->Lease_model->list_leases(in_array($q['status'] ?? '', ['offered', 'scheduled', 'active', 'ended', 'expired', 'cancelled'], true) ? $q['status'] : null, $this->uid());
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
        $in = $this->input();
        $data = $this->validate($in, $this->rules());
        $billingDefaults = $this->Site_setting_model->get_all($this->uid());
        $data['billing_style'] = $data['billing_style'] ?? $billingDefaults['billing_style'];
        $data['prorate_first_month'] = $data['prorate_first_month'] ?? ($billingDefaults['billing_prorate_first_month'] === '1');
        $data['grace_period_days'] = $data['grace_period_days'] ?? (int) $billingDefaults['billing_grace_period_days'];
        $data['late_fee'] = $data['late_fee'] ?? (float) $billingDefaults['billing_late_fee'];
        $data['due_day'] = $data['due_day'] ?? (int) $billingDefaults['billing_due_day'];
        if ($data['billing_style'] === 'anniversary') {
            $startDay = (int) date('j', strtotime($data['start_date']));
            if ($startDay > 28) {
                $this->fail('Anniversary billing requires a lease start date on or before the 28th.', 422, ['start_date' => 'Choose a date on or before the 28th.']);
            }
            $data['due_day'] = $startDay;
        } elseif ($data['billing_style'] === 'first_of_month') {
            if (date('j', strtotime($data['start_date'])) !== '1') {
                $this->fail('This landlord requires leases to start on the first day of a month.', 422, ['start_date' => 'Choose the first day of a month.']);
            }
            $data['due_day'] = 1;
            $data['prorate_first_month'] = false;
        }

        $unit   = $this->Unit_model->available_for_lease($data['unit_id'], false, $this->uid());
        if (!$unit) {
            $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'Unit is unavailable.']);
        }
        $tenant = $this->User_model->find_tenant($data['tenant_id'], $this->uid());
        if (!$tenant || (int) $tenant['is_active'] !== 1) {
            $this->fail('Choose an active tenant account.', 422, ['tenant_id' => 'Tenant not found or inactive.']);
        }
        if ($data['start_date'] < date('Y-m-d')) {
            $this->fail('Choose today or a future move-in date.', 422, ['start_date' => 'Move-in date cannot be in the past.']);
        }
        $contract = $unit['contract_template'] ?: ($unit['property_contract_template'] ?? null);
        $template = $contract ? json_decode($contract, true) : null;
        if ($data['contract_required'] && empty($template['enabled'])) {
            $this->fail('Enable and save an annual contract template on the property or unit first.', 422, ['contract_required' => 'No enabled contract template is available.']);
        }
        if ($data['contract_required'] && $data['start_date'] <= date('Y-m-d')) {
            $this->fail('An approval contract needs a future move-in date so the tenant has time to review it.', 422, ['start_date' => 'Choose a future move-in date for contract approval.']);
        }
        $data['contract_json'] = $data['contract_required'] ? $contract : null;
        if (!empty($data['end_date']) && $data['end_date'] < $data['start_date']) {
            $this->fail('The end date must be after the start date.', 422, ['end_date' => 'Must be on or after the start date.']);
        }
        if (empty($data['monthly_rent'])) {
            $data['monthly_rent'] = (float) $unit['monthly_rent'];   // default: the unit's listed rent
        }
        if ((float) $data['late_fee'] > (float) $data['monthly_rent']) {
            $this->fail('The late fee cannot exceed one month of rent.', 422, ['late_fee' => 'Cannot exceed the monthly rent.']);
        }
        if (!array_key_exists('deposit', $in)) {
            $data['deposit'] = (float) ($unit['default_deposit'] ?? 0);
        }
        $data['contract_months'] = $data['contract_months'] ?? ($data['contract_term'] === 'annually' ? 12 : null);
        if (empty($data['end_date']) && $data['contract_months']) {
            $end = new DateTime($data['start_date']);
            $end->modify('+' . (int) $data['contract_months'] . ' months')->modify('-1 day');
            $data['end_date'] = $end->format('Y-m-d');
        }
        $this->db->transaction();
        try {
            $lockedTenant = $this->db->raw(
                "SELECT id, is_active FROM users WHERE id = ? AND landlord_id = ? AND role = 'tenant' FOR UPDATE",
                [(int) $data['tenant_id'], $this->uid()]
            )->fetch(PDO::FETCH_ASSOC);
            if (!$lockedTenant || (int) $lockedTenant['is_active'] !== 1) {
                $this->fail('Choose an active tenant account.', 422, ['tenant_id' => 'Tenant not found or inactive.']);
            }
            if ($this->Lease_model->tenant_has_current_lease($data['tenant_id'])) {
                $this->fail('This tenant already has a pending contract or scheduled/active lease.', 409, ['tenant_id' => 'Choose a tenant without a current lease.']);
            }
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
        $this->ok([
            'message' => $data['contract_required']
                ? 'Contract sent to tenant for review. It expires on the move-in date if not accepted.'
                : ($data['start_date'] > date('Y-m-d') ? 'Move-in scheduled. The lease becomes active on the move-in date.' : 'Lease started.'),
            'data' => $this->Lease_model->find($id, $this->uid()),
        ], 201);
    }

    public function cancel($id)
    {
        $this->api->require_method('POST');
        if (!$this->Lease_model->cancel_offer($id, $this->uid())) {
            $this->fail('Only an offered or scheduled move-in can be cancelled.', 409);
        }
        $this->ok(['message' => 'Lease offer or scheduled move-in cancelled.']);
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
        $nextRent = (float) ($data['monthly_rent'] ?? $lease['monthly_rent']);
        $nextLateFee = (float) ($data['late_fee'] ?? $lease['late_fee']);
        if ($nextLateFee > $nextRent) {
            $this->fail('The late fee cannot exceed one month of rent.', 422, ['late_fee' => 'Cannot exceed the monthly rent.']);
        }
        $billingStyle = $data['billing_style'] ?? $lease['billing_style'];
        if ($billingStyle === 'anniversary' && (int) date('j', strtotime($lease['start_date'])) > 28) {
            $this->fail('Anniversary billing requires a lease start date on or before the 28th.', 422, ['billing_style' => 'This lease start date is after the 28th.']);
        }
        if ($billingStyle === 'first_of_month' && date('j', strtotime($lease['start_date'])) !== '1') {
            $this->fail('This landlord requires leases to start on the first day of a month.', 422, ['billing_style' => 'This lease does not start on the first day.']);
        }

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
        if ((float) $lease['late_fee'] > (float) ($data['monthly_rent'] ?? $lease['monthly_rent'])) {
            $this->fail('The late fee cannot exceed one month of rent.', 422, ['monthly_rent' => 'Increase the renewed rent or reduce the lease late fee first.']);
        }
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
            $this->fail('This lease document file is not supported.', 422, ['document' => 'Choose a valid lease document file.']);
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

    public function financials()
    {
        $this->api->require_method('GET');
        $this->Lease_model->sync_lifecycle();
        $summary = $this->Lease_model->financial_summary($this->uid());
        $this->ok(['data' => [
            'active_leases_count'     => (int)   ($summary['active_leases_count'] ?? 0),
            'total_monthly_rent'      => (float) ($summary['total_monthly_rent'] ?? 0),
            'estimated_annual_income' => (float) ($summary['estimated_annual_income'] ?? 0),
            'total_deposits'          => (float) ($summary['total_deposits'] ?? 0),
            'total_advances'          => (float) ($summary['total_advances'] ?? 0),
            'total_down_payments'     => (float) ($summary['total_down_payments'] ?? 0),
        ]]);
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
