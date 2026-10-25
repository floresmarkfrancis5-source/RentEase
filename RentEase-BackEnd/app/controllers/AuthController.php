<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * AuthController - token based (JWT) authentication
 *
 *   POST /api/auth/login            email-or-username + password -> user + access/refresh tokens
 *   POST /api/auth/google           Google ID token -> same response (account must already exist)
 *   POST /api/auth/refresh          refresh_token -> new tokens (old one is revoked)
 *   POST /api/auth/logout           revoke the refresh token          [auth]
 *   GET  /api/auth/me               current user                      [auth]
 *   POST /api/auth/change-password  current + new password           [auth]
 *
 * login/google/refresh are protected by the strict 'throttle_auth' middleware (10 tries / minute / IP).
 */
class AuthController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('User_model');
        $this->call->model('User_avatar_model');
    }

    private function public_user($u)
    {
        return [
            'id'                   => (int) $u['id'],
            'username'             => $u['username'],
            'email'                => $u['email'],
            'full_name'            => $u['full_name'],
            'phone'                => $u['phone'] ?? null,
            'role'                 => $u['role'],
            'onboarding_completed' => (int) ($u['onboarding_completed'] ?? 1) === 1,
            'must_change_password' => (int) $u['must_change_password'] === 1,
            'has_avatar'           => $this->User_avatar_model->exists($u['id']),
            'created_at'           => $u['created_at'] ?? null,
        ];
    }

    private function sign_in($user)
    {
        $tokens = $this->api->issue_tokens(['id' => (int) $user['id'], 'role' => $user['role']]);
        $this->ok(['message' => 'Login successful', 'user' => $this->public_user($user), 'tokens' => $tokens]);
    }

    public function login()
    {
        $this->api->require_method('POST');
        $in       = $this->input();
        $login    = trim((string) ($in['login'] ?? $in['email'] ?? $in['username'] ?? ''));   // email OR username
        $password = (string) ($in['password'] ?? '');

        if ($login === '' || $password === '') {
            $this->fail('Enter your email or username and your password.', 422);
        }

        $user = $this->User_model->find_by_login($login);

        // Same message for "no such user", "wrong password" and "disabled" so accounts cannot be probed.
        if (!$user || !password_verify($password, $user['password']) || (int) $user['is_active'] !== 1
            || !$this->User_model->tenant_landlord_active($user)) {
            $this->fail('Invalid email/username or password.', 401);
        }
        $this->sign_in($user);
    }

    public function register()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'username'  => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 50],
            'email'     => ['type' => 'email', 'required' => true],
            'full_name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
            'password'  => ['type' => 'string', 'required' => true, 'min' => 8, 'max' => 200],
        ]);
        if (!preg_match('/^[A-Za-z0-9_.-]+$/', $data['username'])) {
            $this->fail('Choose a username using letters, numbers, dots, dashes, or underscores.', 422, [
                'username' => 'Only letters, numbers, dots, dashes and underscores are allowed.',
            ]);
        }
        if (!$this->strong_password($data['password'])) {
            $this->fail('Choose a stronger password.', 422, ['password' => 'At least 8 characters with a letter and a number.']);
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
            'role' => 'admin',
            'onboarding_completed' => 0,
        ]);
        $this->sign_in($this->User_model->find_by_id($id));
    }

    public function google_register()
    {
        $this->api->require_method('POST');
        $this->call->library('google_auth');
        if (!$this->google_auth->configured()) {
            $this->fail('Google sign-in is not set up on this server.', 503);
        }

        $in = $this->input();
        $profile = $this->google_auth->verify((string) ($in['credential'] ?? ''));
        if (!$profile) {
            $this->fail('Google sign-in failed. Please try again.', 401);
        }
        $username = trim((string) ($in['username'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
            $this->fail('Choose a username using 3–50 letters, numbers, dots, dashes, or underscores.', 422, [
                'username' => 'Use 3–50 letters, numbers, dots, dashes, or underscores.',
            ]);
        }
        if ($this->User_model->find_by_email($profile['email'])) {
            $this->fail('An account already uses this Google email. Sign in instead.', 409, ['email' => 'Already registered.']);
        }
        if ($this->User_model->field_taken('username', $username)) {
            $this->fail('That username is already taken.', 409, ['username' => 'Already in use.']);
        }

        $id = $this->User_model->create_user([
            'username' => $username,
            'email' => $profile['email'],
            'password' => password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
            'full_name' => trim((string) $profile['name']) ?: $username,
            'role' => 'admin',
            'google_id' => $profile['sub'],
            'onboarding_completed' => 0,
        ]);
        $this->sign_in($this->User_model->find_by_id($id));
    }

    public function google()
    {
        $this->api->require_method('POST');
        $this->call->library('google_auth');
        if (!$this->google_auth->configured()) {
            $this->fail('Google sign-in is not set up on this server.', 503);
        }

        $in      = $this->input();
        $profile = $this->google_auth->verify((string) ($in['credential'] ?? ''));
        if (!$profile) {
            $this->fail('Google sign-in failed. Please try again.', 401);
        }

        $user = $this->User_model->find_by_google_id($profile['sub']);
        if (!$user) {
            $user = $this->User_model->find_by_email($profile['email']);
            if ($user) {
                // First Google login for an account the landlord created: link it.
                $this->User_model->update_user($user['id'], ['google_id' => $profile['sub']]);
            }
        }
        if (!$user || (int) $user['is_active'] !== 1 || !$this->User_model->tenant_landlord_active($user)) {
            $this->fail('No active RentEase account uses ' . $profile['email'] . '. Ask your landlord to add you first.', 403);
        }
        $this->sign_in($user);
    }

    public function refresh()
    {
        $this->api->require_method('POST');
        $in    = $this->input();
        $token = (string) ($in['refresh_token'] ?? '');
        if ($token === '') {
            $this->fail('refresh_token is required.', 422);
        }
        $this->api->refresh_access_token($token);   // responds with new tokens (or an error) and exits
    }

    public function logout()
    {
        $this->api->require_method('POST');
        $in    = $this->input();
        $token = (string) ($in['refresh_token'] ?? '');
        if ($token !== '') {
            $this->api->revoke_refresh_token($token);
        }
        $this->ok(['message' => 'Logged out successfully']);
    }

    public function me()
    {
        $this->api->require_method('GET');
        $user = $this->User_model->find_by_id($this->uid());
        $this->ok(['user' => $this->public_user($user)]);
    }

    public function change_password()
    {
        $this->api->require_method('POST');
        $in   = $this->input();
        $user = $this->User_model->find_by_id($this->uid());

        $current = (string) ($in['current_password'] ?? '');
        $new     = (string) ($in['new_password'] ?? '');

        if (!password_verify($current, $user['password'])) {
            $this->fail('Your current password is incorrect.', 422, ['current_password' => 'Incorrect password.']);
        }
        if (!$this->strong_password($new)) {
            $this->fail('Choose a stronger password.', 422, ['new_password' => 'At least 8 characters with a letter and a number.']);
        }
        if ($new === $current) {
            $this->fail('Choose a different password.', 422, ['new_password' => 'The new password must be different.']);
        }

        $this->User_model->update_user($user['id'], ['password' => password_hash($new, PASSWORD_DEFAULT), 'must_change_password' => 0]);
        // Sign every other device out.
        $this->User_model->delete_refresh_tokens($user['id']);
        $this->ok(['message' => 'Password changed. Please log in again on your other devices.']);
    }
}
