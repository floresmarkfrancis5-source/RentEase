<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/** First-run landlord setup. The landlord can always skip and use the regular CRUD pages. */
class OnboardingController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['User_model', 'Property_model', 'Unit_model', 'Lease_model']);
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
                'capacity' => ['type' => 'int', 'min' => 1, 'max' => 50, 'default' => 1],
                'condition_tag' => ['type' => 'enum', 'values' => ['good_condition', 'under_maintenance'], 'default' => 'good_condition'],
            ]);
        }

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
                'start_date' => ['type' => 'date', 'default' => date('Y-m-d')],
                'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
                'deposit' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
                'due_day' => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => 5],
            ]);
            if (!preg_match('/^[A-Za-z0-9_.-]+$/', $clean['username'])) {
                $this->fail('Choose a valid tenant username.', 422, ['tenants.' . $index . '.username' => 'Use letters, numbers, dots, dashes, or underscores.']);
            }
            if (isset($used_units[$clean['unit_index']])) {
                $this->fail('Assign each tenant to a different unit.', 422, ['tenants.' . $index . '.unit_index' => 'This unit already has a tenant in the setup.']);
            }
            if ($units[$clean['unit_index']]['condition_tag'] !== 'good_condition') {
                $this->fail('A tenant can only be assigned to a unit in good condition.', 422, ['tenants.' . $index . '.unit_index' => 'Choose a unit in good condition.']);
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
                    'monthly_rent' => $tenant['monthly_rent'] ?? $units[$tenant['unit_index']]['monthly_rent'],
                    'deposit' => $tenant['deposit'],
                    'due_day' => $tenant['due_day'],
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
