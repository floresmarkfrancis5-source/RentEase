<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Public, non-enumerating email password reset flow. */
class PasswordResetController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['User_model', 'Password_reset_model']);
    }

    public function request()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'email' => ['type' => 'email', 'required' => true],
        ]);
        $this->call->library('password_reset');
        if (!$this->password_reset->configured()) {
            $this->fail('Password recovery email is not configured. Contact the RentEase administrator.', 503);
        }

        $user = $this->User_model->find_by_email($data['email']);
        if ($user && in_array($user['role'], ['admin', 'superadmin', 'tenant'], true) && (int) $user['is_active'] === 1) {
            $status = $this->password_reset->send_to_user($user);
            if ($status !== 'sent') {
                error_log('RentEase password reset email delivery failed for user id ' . (int) $user['id'] . ' (' . $status . ').');
            }
        }
        $this->ok(['message' => 'If an active account uses that email, password reset instructions have been sent.']);
    }

    public function reset()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'token' => ['type' => 'string', 'required' => true, 'min' => 64, 'max' => 64],
            'password' => ['type' => 'string', 'required' => true, 'min' => 8, 'max' => 200],
        ]);
        if (!preg_match('/^[a-f0-9]{64}$/', $data['token']) || !$this->strong_password($data['password'])) {
            $this->fail('This reset link is invalid or expired. Request a new one.', 422);
        }

        if (!$this->Password_reset_model->complete_reset(
            hash('sha256', $data['token']),
            password_hash($data['password'], PASSWORD_DEFAULT),
            $this->User_model
        )) {
            $this->fail('This reset link is invalid or expired. Request a new one.', 422);
        }
        $this->ok(['message' => 'Password reset successfully. You can now sign in with your new password.']);
    }
}
