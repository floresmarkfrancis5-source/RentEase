<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Sends short-lived password reset links without exposing a token to logs. */
class Password_reset
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
        $this->_lava->call->model(['User_model', 'Password_reset_model']);
        $this->_lava->call->library('mailer');
    }

    public function configured()
    {
        return $this->_lava->mailer->configured() && (string) config_item('notifier_frontend_url') !== '';
    }

    public function send_to_user(array $user)
    {
        $token = bin2hex(random_bytes(32));
        $id = $this->_lava->Password_reset_model->create((int) $user['id'], hash('sha256', $token));
        $url = rtrim((string) config_item('notifier_frontend_url'), '/') . '/reset-password?token=' . rawurlencode($token);
        $safe_name = htmlspecialchars($user['full_name'] ?: $user['username'], ENT_QUOTES, 'UTF-8');
        $safe_url = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
        $html = '<p>Hello ' . $safe_name . ',</p>'
            . '<p>We received a request to reset your RentEase password. This link expires in 30 minutes and can be used once.</p>'
            . '<p><a href="' . $safe_url . '">Reset your password</a></p>'
            . '<p>If you did not request this, you can ignore this email.</p>';
        $status = $this->_lava->mailer->send((int) $user['id'], 'password_reset', $id, $user['email'], 'Reset your RentEase password', $html);
        if ($status === 'sent') {
            $this->_lava->Password_reset_model->revoke_previous((int) $user['id'], $id);
        } else {
            $this->_lava->Password_reset_model->revoke($id);
        }
        return $status;
    }
}
