<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/** TenantController (admin) - the landlord creates and manages tenant accounts. */
class TenantController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['User_model', 'Unit_model', 'Lease_model']);
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
            'start_date' => ['type' => 'date', 'default' => date('Y-m-d')],
            'monthly_rent' => ['type' => 'decimal', 'min' => 1, 'max' => 99999999.99, 'nullable' => true],
            'deposit'    => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'due_day'    => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => 5],
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

        $this->db->transaction();
        try {
            $unit = $this->Unit_model->available_for_lease($data['unit_id'], true, $this->uid());
            if (!$unit) {
                $this->db->roll_back();
                $this->fail('Choose a vacant unit in good condition.', 409, ['unit_id' => 'This unit is no longer available.']);
            }
            $id = $this->User_model->create_user([
                'username'             => $data['username'],
                'landlord_id'          => $this->uid(),
                'email'                => $data['email'],
                'password'             => password_hash($password, PASSWORD_DEFAULT),
                'full_name'            => $data['full_name'],
                'phone'                => $data['phone'] ?? null,
                'role'                 => 'tenant',
                'must_change_password' => 1,
            ]);
            $this->Lease_model->create_lease_in_transaction([
                'unit_id'      => $data['unit_id'],
                'tenant_id'    => $id,
                'start_date'   => $data['start_date'],
                'monthly_rent' => $data['monthly_rent'] ?? $unit['monthly_rent'],
                'deposit'      => $data['deposit'],
                'due_day'      => $data['due_day'],
            ], $this->uid());
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }

        $this->call->library('notifier');
        $this->notifier->welcome($id);

        $res = ['message' => 'Tenant account created', 'data' => $this->User_model->find_tenant($id, $this->uid())];
        if ($generated) {
            $res['temporary_password'] = $password;   // shown ONCE so the landlord can hand it to the tenant
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

    public function reset_password($id)
    {
        $this->api->require_method('POST');
        $this->not_found_unless($this->User_model->find_tenant($id, $this->uid()), 'Tenant');
        $pw = $this->random_password();
        $this->User_model->update_user($id, ['password' => password_hash($pw, PASSWORD_DEFAULT), 'must_change_password' => 1]);
        $this->db->raw('DELETE FROM refresh_tokens WHERE user_id = ?', [(int) $id]);
        $this->ok(['message' => 'Password reset', 'temporary_password' => $pw]);
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
