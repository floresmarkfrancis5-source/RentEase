<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** SuperadminController - platform-wide landlord and superadmin account administration. */
class SuperadminController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('User_model');
    }

    public function landlords()
    {
        $this->api->require_method('GET');
        $rows = $this->User_model->landlords();
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function update_landlord($id)
    {
        $this->api->require_method('PATCH');
        $landlord = $this->not_found_unless($this->User_model->find_landlord($id), 'Landlord');
        $data = $this->validate($this->input(), [
            'is_active' => ['type' => 'bool', 'required' => true],
        ]);
        $this->db->transaction();
        try {
            $this->User_model->update_user($landlord['id'], $data);
            if (!$data['is_active']) {
                $this->db->raw('DELETE FROM refresh_tokens WHERE user_id = ?', [(int) $landlord['id']]);
            }
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
        $this->ok(['message' => $data['is_active'] ? 'Landlord account activated.' : 'Landlord account deactivated.']);
    }

    public function send_landlord_reset($id)
    {
        $this->api->require_method('POST');
        $landlord = $this->not_found_unless($this->User_model->find_landlord($id), 'Landlord');
        if ((int) $landlord['is_active'] !== 1) {
            $this->fail('Activate the landlord account before sending password reset instructions.', 409);
        }
        $this->call->library('password_reset');
        if (!$this->password_reset->configured()) {
            $this->fail('Password recovery email is not configured. Set up SMTP before sending reset links.', 503);
        }
        $status = $this->password_reset->send_to_user($landlord);
        if ($status !== 'sent') {
            $this->fail('The reset email could not be delivered. Check the email log and SMTP settings.', 502);
        }
        $this->ok(['message' => 'Password reset link sent to the landlord’s account email.']);
    }

    public function superadmins()
    {
        $this->api->require_method('GET');
        $rows = $this->User_model->superadmins();
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function create_superadmin()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'username' => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 50],
            'email' => ['type' => 'email', 'required' => true],
            'full_name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
            'password' => ['type' => 'string', 'required' => true, 'min' => 12, 'max' => 200],
        ]);
        if (!preg_match('/^[A-Za-z0-9_.-]+$/', $data['username'])) {
            $this->fail('Choose a valid username.', 422, ['username' => 'Use letters, numbers, dots, dashes, or underscores.']);
        }
        if (!$this->strong_password($data['password'])) {
            $this->fail('Choose a stronger password.', 422, ['password' => 'At least 12 characters with a letter and a number.']);
        }
        if ($this->User_model->field_taken('username', $data['username'])) {
            $this->fail('That username is already taken.', 409, ['username' => 'Already in use.']);
        }
        if ($this->User_model->find_by_email($data['email'])) {
            $this->fail('That email address already has an account.', 409, ['email' => 'Already registered.']);
        }
        $id = $this->User_model->create_user([
            'username' => $data['username'],
            'email' => $data['email'],
            'password' => password_hash($data['password'], PASSWORD_DEFAULT),
            'full_name' => $data['full_name'],
            'role' => 'superadmin',
        ]);
        $this->ok(['message' => 'Superadmin account created.', 'data' => [
            'id' => $id,
            'username' => $data['username'],
            'email' => $data['email'],
            'full_name' => $data['full_name'],
            'role' => 'superadmin',
            'is_active' => 1,
        ]], 201);
    }

    public function update_superadmin($id)
    {
        $this->api->require_method('PATCH');
        $superadmin = $this->db->raw(
            "SELECT id, is_active FROM users WHERE id = ? AND role = 'superadmin' LIMIT 1",
            [(int) $id]
        )->fetch(PDO::FETCH_ASSOC);
        $this->not_found_unless($superadmin, 'Superadmin');
        $data = $this->validate($this->input(), [
            'is_active' => ['type' => 'bool', 'required' => true],
        ]);
        if (!(int) $data['is_active'] && (int) $id === $this->uid()) {
            $this->fail('You cannot deactivate your own superadmin account.', 409);
        }
        if (!(int) $data['is_active']) {
            $this->db->transaction();
            try {
                $this->db->raw('SELECT id FROM users WHERE role = ? FOR UPDATE', ['superadmin'])->fetchAll(PDO::FETCH_COLUMN);
                if ((int) $superadmin['is_active'] === 1 && $this->User_model->active_superadmin_count() <= 1) {
                    $this->db->roll_back();
                    $this->fail('At least one active superadmin account must remain.', 409);
                }
                $this->User_model->update_user($id, $data);
                $this->db->raw('DELETE FROM refresh_tokens WHERE user_id = ?', [(int) $id]);
                $this->db->commit();
            } catch (Throwable $e) {
                $this->db->roll_back();
                throw $e;
            }
        } else {
            $this->User_model->update_user($id, $data);
        }
        $this->ok(['message' => $data['is_active'] ? 'Superadmin account activated.' : 'Superadmin account deactivated.']);
    }
}
