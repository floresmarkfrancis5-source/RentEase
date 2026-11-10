<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** TenantController (admin) - the landlord creates and manages tenant accounts. */
class TenantController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['User_model', 'Unit_model', 'Lease_model', 'Site_setting_model']);
    }

    private function rules($creating = false)
    {
        $rules = [
            'username'  => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 50],
            'full_name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
            'email'     => ['type' => 'email', 'required' => true],
            'phone'     => ['type' => 'string', 'max' => 30, 'nullable' => true],
        ];
        if ($creating) {
            $rules += [
            'unit_id'   => ['type' => 'int', 'required' => true, 'min' => 1],
            'start_date' => ['type' => 'date', 'default' => date('Y-m-d', strtotime('+5 days'))],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'deposit'    => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'due_day'    => ['type' => 'int', 'min' => 1, 'max' => 28, 'nullable' => true],
            'billing_style' => ['type' => 'enum', 'values' => ['calendar', 'anniversary', 'first_of_month'], 'nullable' => true],
            'prorate_first_month' => ['type' => 'bool', 'nullable' => true],
            'grace_period_days' => ['type' => 'int', 'min' => 0, 'max' => 15, 'nullable' => true],
            'late_fee' => ['type' => 'decimal', 'min' => 0, 'max' => 999999.99, 'nullable' => true],
            'contract_required' => ['type' => 'bool', 'nullable' => true],
            ];
        }
        return $rules;
    }

    private function random_password()
    {
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        do {
            $pw = '';
            for ($i = 0; $i < 10; $i++) {
                $pw .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while (!$this->strong_password($pw));
        return $pw;
    }

    public function index()
    {
        $this->api->require_method('GET');
        $this->Lease_model->sync_lifecycle();
        $rows = $this->User_model->tenants($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant')]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $in   = $this->input();
        $data = $this->validate($in, $this->rules(true));
        $billingDefaults = $this->Site_setting_model->get_all($this->uid());
        $data['billing_style'] = $data['billing_style'] ?? $billingDefaults['billing_style'];
        $data['prorate_first_month'] = $data['prorate_first_month'] ?? ($billingDefaults['billing_prorate_first_month'] === '1');
        $data['grace_period_days'] = $data['grace_period_days'] ?? (int) $billingDefaults['billing_grace_period_days'];
        $data['late_fee'] = $data['late_fee'] ?? (float) $billingDefaults['billing_late_fee'];
        $data['due_day'] = $data['due_day'] ?? (int) $billingDefaults['billing_due_day'];
        if ($data['start_date'] < date('Y-m-d')) {
            $this->fail('Choose today or a future move-in date.', 422, ['start_date' => 'Move-in date cannot be in the past.']);
        }
        if (!preg_match('/^[A-Za-z0-9_.-]+$/', $data['username'])) {
            $this->fail('Choose a username using letters, numbers, dots, dashes, or underscores.', 422, ['username' => 'Invalid username.']);
        }
        if ($this->User_model->field_taken('username', $data['username'])) {
            $this->fail('That username is already taken.', 409, ['username' => 'Already in use.']);
        }
        $unit = $this->Unit_model->available_for_lease($data['unit_id'], false, $this->uid());
        if (!$unit) {
            $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'This unit is not available for assignment.']);
        }
        $template = $unit['contract_template'] ?: ($unit['property_contract_template'] ?? null);
        $template = $template ? json_decode($template, true) : null;
        $contractRequired = $data['contract_required'] === null
            ? !empty($template['enabled'])
            : !empty($data['contract_required']);
        if ($contractRequired && empty($template['enabled'])) {
            $this->fail('Enable and save an annual contract template on the property or unit first.', 422, ['contract_required' => 'No enabled contract template is available.']);
        }
        if ($contractRequired && $data['start_date'] <= date('Y-m-d')) {
            $this->fail('An approval contract needs a future move-in date so the tenant has time to review it.', 422, ['start_date' => 'Choose a future move-in date for contract approval.']);
        }
        $data['contract_required'] = $contractRequired;
        $data['contract_json'] = $contractRequired ? ($unit['contract_template'] ?: ($unit['property_contract_template'] ?? null)) : null;
        if (!array_key_exists('deposit', $in)) {
            $data['deposit'] = (float) ($unit['default_deposit'] ?? 0);
        }
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
        if ((float) $data['late_fee'] > (float) ($data['monthly_rent'] ?? $unit['monthly_rent'])) {
            $this->fail('The late fee cannot exceed one month of rent.', 422, ['late_fee' => 'Cannot exceed the monthly rent.']);
        }

        $password = trim((string) ($in['password'] ?? ''));
        $generated = false;
        if ($password === '') {
            $password = $this->random_password();
            $generated = true;
        } elseif (!$this->strong_password($password)) {
            $this->fail('Choose a stronger password.', 422, ['password' => 'At least 8 characters with a letter and a number.']);
        }

        if ($this->User_model->find_by_email($data['email'])) {
            $this->fail('That email address already has an account.', 409, ['email' => 'Already registered.']);
        }

        $this->call->model('Tenant_invitation_model');
        $tenant = $this->User_model->create_tenant_with_lease([
            'username'             => $data['username'],
            'landlord_id'          => $this->uid(),
            'email'                => $data['email'],
            'password'             => password_hash($password, PASSWORD_DEFAULT),
            'full_name'            => $data['full_name'],
            'phone'                => $data['phone'] ?? null,
            'role'                 => 'tenant',
            'must_change_password' => 1,
        ], [
            'unit_id'      => $data['unit_id'],
            'start_date'   => $data['start_date'],
            'contract_term' => 'annually',
            'contract_months' => 12,
            'monthly_rent' => $data['monthly_rent'] ?? null,
            'deposit'      => $data['deposit'],
            'due_day'      => $data['due_day'],
            'billing_style' => $data['billing_style'],
            'prorate_first_month' => $data['prorate_first_month'],
            'grace_period_days' => $data['grace_period_days'],
            'late_fee' => $data['late_fee'],
        ], $this->uid(), $this->Unit_model, $this->Lease_model, $this->Tenant_invitation_model);
        if (!$tenant) {
            $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'This unit is no longer available.']);
        }
        $id = $tenant['id'];
        $unit = $tenant['unit'];
        $invitation = $tenant['invitation'];

        $raw_token  = $invitation['token'];
        $unit_label = ($unit['unit_name'] ?? '') . (isset($unit['property_name']) ? ' · ' . $unit['property_name'] : '');

        $email_status = 'failed';
        try {
            $this->call->library('notifier');
            $email_status = $this->notifier->welcome($id, $raw_token, $unit_label);
        } catch (Throwable $e) {
            error_log('RentEase tenant invitation notification failed for user id ' . (int) $id . ': ' . $e->getMessage());
        }

        $frontend_url   = rtrim((string) config_item('notifier_frontend_url'), '/');
        $activation_url = ($frontend_url ?: '') . '/activate?token=' . rawurlencode($raw_token);
        $message = $email_status === 'sent'
            ? 'Tenant account created. The invitation email is being sent to ' . $data['email'] . '.'
            : 'Tenant account created, but the invitation email could not be sent. Share the activation link or resend the invitation from the tenant list.';

        $res = [
            'message'          => $message,
            'data'             => $tenant['data'],
            'activation_url'   => $activation_url,
            'activation_token' => $raw_token,
            'expires_at'       => $invitation['expires_at'],
            'invitation_email_status' => $email_status,
        ];
        if ($generated) {
            $res['temporary_password'] = $password;   // fallback so landlord can also hand it in person
        }
        $this->ok($res, 201);
    }

    public function update($id)
    {
        $partial = $_SERVER['REQUEST_METHOD'] === 'PATCH';
        $tenant  = $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');
        $rules   = $this->rules() + ['is_active' => ['type' => 'bool']];
        $data    = $this->validate($this->input(), $rules, $partial);

        if (isset($data['email']) && $this->User_model->field_taken('email', $data['email'], $id)) {
            $this->fail('That email address already has an account.', 409, ['email' => 'Already registered.']);
        }
        if (isset($data['username']) && $this->User_model->field_taken('username', $data['username'], $id)) {
            $this->fail('That username is already taken.', 409, ['username' => 'Already in use.']);
        }
        if (isset($data['username']) && !preg_match('/^[A-Za-z0-9_.-]+$/', $data['username'])) {
            $this->fail('Choose a valid username.', 422, ['username' => 'Only letters, numbers, dots, dashes and underscores are allowed.']);
        }
        $this->User_model->update_user($id, $data);
        $this->ok(['message' => 'Tenant updated', 'data' => $this->User_model->find_tenant($id, $this->uid())]);
    }

    public function resend_invite($id)
    {
        $this->api->require_method('POST');
        $tenant = $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');

        $this->call->model('Tenant_invitation_model');
        $invitation = $this->Tenant_invitation_model->create_invitation($tenant['id']);
        $raw_token  = $invitation['token'];

        $lease = $this->Lease_model->active_for_tenant($tenant['id']);
        $unit_label = $lease ? ($lease['unit_name'] . ' · ' . $lease['property_name']) : '';

        $this->call->library('notifier');
        $this->notifier->welcome($tenant['id'], $raw_token, $unit_label);

        $frontend_url   = rtrim((string) config_item('notifier_frontend_url'), '/');
        $activation_url = ($frontend_url ?: '') . '/activate?token=' . rawurlencode($raw_token);

        $this->ok([
            'message'        => 'Activation link sent to ' . $tenant['email'] . '.',
            'activation_url' => $activation_url,
            'expires_at'     => $invitation['expires_at'],
        ]);
    }

    public function reset_password($id)
    {
        $this->api->require_method('POST');
        $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');
        $pw = $this->random_password();
        $this->User_model->update_user($id, ['password' => password_hash($pw, PASSWORD_DEFAULT), 'must_change_password' => 1]);
        $this->User_model->delete_refresh_tokens($id);
        $this->ok(['message' => 'Password reset', 'temporary_password' => $pw]);
    }

    public function reassign_unit($id)
    {
        $this->api->require_method('POST');
        $tenant = $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');
        if (!(int) $tenant['is_active']) {
            $this->fail('Cannot move an inactive tenant.', 409);
        }

        $activeLease = $this->Lease_model->active_for_tenant($tenant['id']);
        if (!$activeLease) {
            $this->fail('This tenant does not have an active lease to move.', 409);
        }

        $in = $this->input();
        $data = $this->validate($in, [
            'new_unit_id'  => ['type' => 'int', 'required' => true, 'min' => 1],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'notes'        => ['type' => 'string', 'max' => 1000, 'nullable' => true],
        ]);

        $new_unit_id = (int) $data['new_unit_id'];
        $old_unit_id = (int) $activeLease['unit_id'];

        if ($new_unit_id === $old_unit_id) {
            $this->fail('The tenant is already assigned to this unit.', 422, ['new_unit_id' => 'Select a different unit.']);
        }

        $newUnit = $this->Unit_model->available_for_lease($new_unit_id, false, $this->uid());
        if (!$newUnit) {
            $this->fail('The selected unit is not available or not vacant.', 409, ['new_unit_id' => 'Choose a vacant unit in good condition.']);
        }

        $oldUnit = $this->Unit_model->find($old_unit_id, $this->uid());
        $newRent = !empty($data['monthly_rent']) ? (float) $data['monthly_rent'] : (float) $newUnit['monthly_rent'];

        $this->db->transaction();
        try {
            // 1. Set old unit to vacant
            $this->Unit_model->set_occupancy($old_unit_id, 'vacant');

            // 2. Set new unit to occupied
            $this->Unit_model->set_occupancy($new_unit_id, 'occupied');

            // 3. Update lease
            $this->db->raw(
                "UPDATE leases 
                 SET unit_id = ?, monthly_rent = ?, estimated_annual_income = ?, updated_at = NOW()
                 WHERE id = ? AND status = 'active'",
                [$new_unit_id, $newRent, $newRent * 12, (int) $activeLease['id']]
            );

            // 4. Record lease event
            $oldUnitName = $oldUnit['unit_name'] ?? ('Unit #' . $old_unit_id);
            $newUnitName = $newUnit['unit_name'] . (isset($newUnit['property_name']) ? ' · ' . $newUnit['property_name'] : '');
            $reasonNote = !empty($data['notes']) ? ' Note: ' . $data['notes'] : '';

            $this->Lease_model->record_event(
                (int) $activeLease['id'],
                'unit_reassigned_by_landlord',
                "Landlord moved tenant from {$oldUnitName} to {$newUnitName}.{$reasonNote}",
                ['unit_id' => $old_unit_id, 'unit_name' => $oldUnitName, 'monthly_rent' => $activeLease['monthly_rent']],
                ['unit_id' => $new_unit_id, 'unit_name' => $newUnitName, 'monthly_rent' => $newRent],
                $this->uid()
            );

            // 5. If tenant had any pending transfer request, resolve it as approved
            $this->db->raw(
                "UPDATE unit_transfer_requests 
                 SET status = 'approved', decided_by = ?, decided_at = NOW(), admin_note = 'Moved to unit by landlord'
                 WHERE tenant_id = ? AND status = 'pending'",
                [$this->uid(), (int) $tenant['id']]
            );

            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }

        // 6. Notify tenant via In-App and Email
        $this->call->library('notifier');
        $this->notifier->tenant_unit_reassigned(
            $tenant['id'],
            $oldUnitName,
            $newUnitName,
            $newRent,
            $data['notes'] ?? null
        );

        $this->ok([
            'message' => "Tenant {$tenant['full_name']} moved to {$newUnit['unit_name']} successfully. Tenant has been notified.",
            'data'    => $this->User_model->find_tenant($id, $this->uid()),
        ]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');
        if ($this->User_model->has_history($id)) {
            $this->fail('This tenant has lease, billing or transfer records. Deactivate the account instead of deleting it.', 409);
        }
        $this->User_model->delete_user($id);
        $this->ok(['message' => 'Tenant deleted']);
    }
}
