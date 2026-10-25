<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

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

        $this->db->transaction();
        try {
            $token = $this->Password_reset_model->valid_token(hash('sha256', $data['token']), true);
            if (!$token) {
                $this->db->roll_back();
                $this->fail('This reset link is invalid or expired. Request a new one.', 422);
            }
            $this->User_model->update_user($token['user_id'], [
                'password' => password_hash($data['password'], PASSWORD_DEFAULT),
                'must_change_password' => 0,
            ]);
            $this->Password_reset_model->consume($token['id']);
            $this->db->raw(
                'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
                [(int) $token['user_id']]
            );
            $this->db->raw('DELETE FROM refresh_tokens WHERE user_id = ?', [(int) $token['user_id']]);
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
        $this->ok(['message' => 'Password reset successfully. You can now sign in with your new password.']);
    }
}
