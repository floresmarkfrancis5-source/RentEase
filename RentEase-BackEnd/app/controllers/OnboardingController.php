<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** First-run landlord setup. The landlord can always skip and use the regular CRUD pages. */
class OnboardingController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['User_model', 'Property_model', 'Unit_model', 'Lease_model', 'Site_setting_model']);
    }

    public function status()
    {
        $this->api->require_method('GET');
        $user = $this->User_model->find_by_id($this->uid());
        $properties = $this->Property_model->all_with_counts($this->uid());
        $this->ok(['data' => [
            'completed' => (int) ($user['onboarding_completed'] ?? 1) === 1,
            'has_properties' => count($properties) > 0,
        ]]);
    }

    public function complete()
    {
        $this->api->require_method('POST');
        $this->User_model->update_user($this->uid(), ['onboarding_completed' => 1]);
        $this->ok(['message' => 'Setup skipped', 'onboarding_completed' => true]);
    }

    private function temporary_password()
    {
        $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
        do {
            $password = '';
            for ($i = 0; $i < 12; $i++) {
                $password .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while (!$this->strong_password($password));
        return $password;
    }

    public function save()
    {
        $this->api->require_method('POST');
        $in = $this->input();
        $property = $this->validate((array) ($in['property'] ?? []), [
            'name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
            'type' => ['type' => 'enum', 'values' => ['apartment', 'boarding_house'], 'default' => 'apartment'],
            'address' => ['type' => 'string', 'required' => true, 'max' => 255],
            'city' => ['type' => 'string', 'max' => 100],
            'barangay' => ['type' => 'string', 'max' => 100],
            'latitude' => ['type' => 'decimal', 'min' => -90, 'max' => 90, 'scale' => 7, 'nullable' => true],
            'longitude' => ['type' => 'decimal', 'min' => -180, 'max' => 180, 'scale' => 7, 'nullable' => true],
            'description' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ]);
        if (array_key_exists('contract_template', $in['property'] ?? [])) {
            $property['contract_template'] = $this->contract_template($in['property']['contract_template']);
        }

        $unit_inputs = $in['units'] ?? [];
        $tenant_inputs = $in['tenants'] ?? [];
        if (!is_array($unit_inputs) || count($unit_inputs) < 1 || count($unit_inputs) > 100) {
            $this->fail('Add between 1 and 100 units to continue.', 422, ['units' => 'At least one unit is required.']);
        }
        if (!is_array($tenant_inputs) || count($tenant_inputs) > count($unit_inputs)) {
            $this->fail('Each tenant needs a distinct unit assignment.', 422, ['tenants' => 'Check the tenant-to-unit assignments.']);
        }

        $units = [];
        foreach ($unit_inputs as $index => $unit) {
            if (!is_array($unit)) {
                $this->fail('Check the unit details.', 422, ['units' => 'Invalid unit entry.']);
            }
            $units[] = $this->validate($unit, [
                'unit_name' => ['type' => 'string', 'required' => true, 'max' => 50],
                'monthly_rent' => ['type' => 'decimal', 'required' => true, 'min' => 1, 'max' => 99999999.99],
                'default_deposit' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
                'default_due_day' => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => 5],
                'capacity' => ['type' => 'int', 'min' => 1, 'max' => 50, 'default' => 1],
                'condition_tag' => ['type' => 'enum', 'values' => ['good_condition', 'under_maintenance'], 'default' => 'good_condition'],
            ]);
        }

        $billingDefaults = $this->Site_setting_model->get_all($this->uid());
        $tenants = [];
        $used_units = [];
        $seen_usernames = [];
        $seen_emails = [];
        foreach ($tenant_inputs as $index => $tenant) {
            if (!is_array($tenant)) {
                $this->fail('Check the tenant details.', 422, ['tenants' => 'Invalid tenant entry.']);
            }
            $clean = $this->validate($tenant, [
                'unit_index' => ['type' => 'int', 'required' => true, 'min' => 0, 'max' => count($units) - 1],
                'username' => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 50],
                'email' => ['type' => 'email', 'required' => true],
                'full_name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
                'phone' => ['type' => 'string', 'max' => 30, 'nullable' => true],
                'start_date' => ['type' => 'date', 'default' => date('Y-m-d', strtotime('+5 days'))],
                'end_date' => ['type' => 'date', 'nullable' => true],
                'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
                'deposit' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
                'due_day' => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => (int) $billingDefaults['billing_due_day']],
            ]);
            if (!preg_match('/^[A-Za-z0-9_.-]+$/', $clean['username'])) {
                $this->fail('Choose a valid tenant username.', 422, ['tenants.' . $index . '.username' => 'Use letters, numbers, dots, dashes, or underscores.']);
            }
            if ($clean['start_date'] < date('Y-m-d')) {
                $this->fail('Choose today or a future move-in date.', 422, ['tenants.' . $index . '.start_date' => 'Move-in date cannot be in the past.']);
            }
            $startDay = (int) date('j', strtotime($clean['start_date']));
            if ($billingDefaults['billing_style'] === 'first_of_month' && $startDay !== 1) {
                $this->fail('This landlord requires leases to start on the first day of a month.', 422, ['tenants.' . $index . '.start_date' => 'Choose the first day of a month.']);
            }
            if ($billingDefaults['billing_style'] === 'anniversary' && $startDay > 28) {
                $this->fail('Anniversary billing requires a lease start date on or before the 28th.', 422, ['tenants.' . $index . '.start_date' => 'Choose a date on or before the 28th.']);
            }
            $contract_template = $property['contract_template'] ? json_decode($property['contract_template'], true) : null;
            if (!empty($contract_template['enabled']) && $clean['start_date'] <= date('Y-m-d')) {
                $this->fail('An approval contract needs a future move-in date so the tenant has time to review it.', 422, ['tenants.' . $index . '.start_date' => 'Choose a future move-in date for contract approval.']);
            }
            if (isset($used_units[$clean['unit_index']])) {
                $this->fail('Assign each tenant to a different unit.', 422, ['tenants.' . $index . '.unit_index' => 'This unit already has a tenant in the setup.']);
            }
            if ($units[$clean['unit_index']]['condition_tag'] !== 'good_condition') {
                $this->fail('A tenant can only be assigned to a unit in good condition.', 422, ['tenants.' . $index . '.unit_index' => 'Choose a unit in good condition.']);
            }
            $rent = $clean['monthly_rent'] ?? $units[$clean['unit_index']]['monthly_rent'];
            if ((float) $billingDefaults['billing_late_fee'] > (float) $rent) {
                $this->fail('The late fee cannot exceed one month of rent.', 422, ['tenants.' . $index . '.monthly_rent' => 'Increase the rent or lower the default late fee.']);
            }
            if (empty($clean['end_date'])) {
                $end = new DateTime($clean['start_date']);
                $end->modify('+1 year')->modify('-1 day');
                $clean['end_date'] = $end->format('Y-m-d');
            }
            if ($clean['end_date'] < $clean['start_date']) {
                $this->fail('The lease end date must be after the move-in date.', 422, ['tenants.' . $index . '.end_date' => 'Must be on or after the move-in date.']);
            }
            $username_key = strtolower($clean['username']);
            if (isset($seen_usernames[$username_key]) || $this->User_model->field_taken('username', $clean['username'])) {
                $this->fail('A tenant username is already in use.', 409, ['tenants.' . $index . '.username' => 'Already in use.']);
            }
            $email_key = strtolower($clean['email']);
            if (isset($seen_emails[$email_key]) || $this->User_model->find_by_email($email_key)) {
                $this->fail('A tenant email already has an account.', 409, ['tenants.' . $index . '.email' => 'Already registered.']);
            }
            $seen_usernames[$username_key] = true;
            $seen_emails[$email_key] = true;
            $used_units[$clean['unit_index']] = true;
            $tenants[] = $clean;
        }

        $created_credentials = [];
        $this->db->transaction();
        try {
            $property_id = $this->Property_model->create_property($property, $this->uid());
            $unit_ids = [];
            foreach ($units as $unit) {
                $unit['property_id'] = $property_id;
                $unit_ids[] = $this->Unit_model->create_unit($unit);
            }
            foreach ($tenants as $tenant) {
                $temporary_password = $this->temporary_password();
                $tenant_id = $this->User_model->create_user([
                    'username' => $tenant['username'],
                    'email' => $tenant['email'],
                    'password' => password_hash($temporary_password, PASSWORD_DEFAULT),
                    'full_name' => $tenant['full_name'],
                    'phone' => $tenant['phone'] ?? null,
                    'role' => 'tenant',
                    'landlord_id' => $this->uid(),
                    'must_change_password' => 1,
                ]);
                $this->Lease_model->create_lease_in_transaction([
                    'unit_id' => $unit_ids[$tenant['unit_index']],
                    'tenant_id' => $tenant_id,
                    'start_date' => $tenant['start_date'],
                    'end_date' => $tenant['end_date'],
                    'monthly_rent' => $tenant['monthly_rent'] ?? $units[$tenant['unit_index']]['monthly_rent'],
                    'deposit' => $tenant['deposit'] ?? $units[$tenant['unit_index']]['default_deposit'],
                    'due_day' => $tenant['due_day'] ?? $billingDefaults['billing_due_day'],
                    'billing_style' => $billingDefaults['billing_style'],
                    'prorate_first_month' => $billingDefaults['billing_prorate_first_month'] === '1',
                    'grace_period_days' => (int) $billingDefaults['billing_grace_period_days'],
                    'late_fee' => (float) $billingDefaults['billing_late_fee'],
                    'contract_term' => 'annually',
                    'contract_months' => 12,
                    'contract_required' => !empty($property['contract_template']) && !empty(json_decode($property['contract_template'], true)['enabled']),
                    'contract_json' => $property['contract_template'] ?? null,
                ], $this->uid());
                $created_credentials[] = [
                    'username' => $tenant['username'],
                    'email' => $tenant['email'],
                    'full_name' => $tenant['full_name'],
                    'temporary_password' => $temporary_password,
                ];
            }
            $this->User_model->update_user($this->uid(), ['onboarding_completed' => 1]);
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }

        foreach ($created_credentials as $credential) {
            $user = $this->User_model->find_by_email($credential['email']);
            $this->call->library('notifier');
            $this->notifier->welcome($user['id']);
        }
        $this->ok([
            'message' => 'Your property setup is complete.',
            'onboarding_completed' => true,
            'property_id' => $property_id,
            'units_created' => count($unit_ids),
            'tenants_created' => count($created_credentials),
            'tenant_credentials' => $created_credentials,
        ], 201);
    }
}
