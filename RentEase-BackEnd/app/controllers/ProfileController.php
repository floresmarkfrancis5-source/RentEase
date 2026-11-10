<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * ProfileController - the logged-in person (landlord OR tenant) edits their own profile.
 *   GET    /api/profile          read my profile
 *   PUT    /api/profile          update full name, username, e-mail, phone
 *   GET    /api/profile/photo    my profile picture (private - needs the login token)
 *   PUT    /api/profile/photo    { image: "data:image/webp;base64,..." }
 *   DELETE /api/profile/photo    remove my picture
 * Everything is scoped to the token's user id, so nobody can touch another account.
 * Role, active flag and password are NOT editable here (password has its own endpoint).
 */
class ProfileController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('User_model');
        $this->call->model('User_avatar_model');
    }

    private function payload($u)
    {
        return [
            'id'                   => (int) $u['id'],
            'username'             => $u['username'],
            'email'                => $u['email'],
            'full_name'            => $u['full_name'],
            'phone'                => $u['phone'],
            'role'                 => $u['role'],
            'must_change_password' => (int) $u['must_change_password'] === 1,
            'has_avatar'           => $this->User_avatar_model->exists($u['id']),
            'avatar_url'           => $this->User_avatar_model->get_url($u['id']),
            'google_linked'        => !empty($u['google_id']),
            'created_at'           => $u['created_at'],
        ];
    }

    public function show()
    {
        $this->api->require_method('GET');
        $user = $this->not_found_unless($this->User_model->find_by_id($this->uid()), 'Account');
        $this->ok(['user' => $this->payload($user)]);
    }

    public function update()
    {
        $this->api->require_method('PUT');
        $user = $this->not_found_unless($this->User_model->find_by_id($this->uid()), 'Account');
        $in   = $this->input();

        $data = $this->validate($in, [
            'full_name' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 120],
            'username'  => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 40],
            'email'     => ['type' => 'email',  'required' => true],
            'phone'     => ['type' => 'string', 'max' => 30, 'nullable' => true],
        ]);

        $errors = [];
        $data['username'] = strtolower($data['username']);
        if (!preg_match('/^[a-z0-9][a-z0-9_.-]{2,39}$/', $data['username'])) {
            $errors['username'] = 'Use letters, numbers, dot, dash or underscore (3-40 characters, no spaces).';
        }
        if (($data['phone'] ?? '') !== '' && !preg_match('/^[0-9+()\s-]{7,30}$/', $data['phone'])) {
            $errors['phone'] = 'Enter a valid phone number.';
        }
        if (!$errors && $data['username'] !== $user['username'] && $this->User_model->field_taken('username', $data['username'], $user['id'])) {
            $errors['username'] = 'That username is already taken.';
        }
        if (!$errors && $data['email'] !== strtolower($user['email']) && $this->User_model->field_taken('email', $data['email'], $user['id'])) {
            $errors['email'] = 'That email is already used by another account.';
        }

        // Changing how you log in (username / e-mail) needs the current password.
        $login_changed = $data['username'] !== $user['username'] || $data['email'] !== strtolower($user['email']);
        if (!$errors && $login_changed && !password_verify((string) ($in['current_password'] ?? ''), $user['password'])) {
            $errors['current_password'] = 'Enter your current password to change your username or email.';
        }
        if ($errors) {
            $this->fail('Please fix the highlighted fields.', 422, $errors);
        }

        $this->User_model->update_user($user['id'], [
            'full_name' => $data['full_name'],
            'username' => $data['username'],
            'email' => $data['email'],
            'phone' => ($data['phone'] ?? '') === '' ? null : $data['phone'],
        ]);

        $fresh = $this->User_model->find_by_id($user['id']);
        $this->ok(['message' => 'Profile saved', 'user' => $this->payload($fresh)]);
    }

    public function photo_show()
    {
        $this->api->require_method('GET');
        $row = $this->User_avatar_model->get($this->uid());
        if (!$row) {
            $this->fail('No profile picture.', 404);
        }
        if (!empty($row['avatar_url'])) {
            header('Location: ' . $row['avatar_url'], true, 302);
            exit;
        }
        header('Cache-Control: private, max-age=0, must-revalidate');
        header('Content-Type: ' . $row['mime']);
        header('Content-Length: ' . strlen($row['data']));
        echo $row['data'];
        exit;
    }

    public function photo_upload()
    {
        $this->api->require_method('PUT');
        $raw = json_decode((string) file_get_contents('php://input'), true);
        $data_url = is_array($raw) ? ($raw['image'] ?? null) : null;
        [$bin, $mime, $err] = $this->User_avatar_model->decode_data_url($data_url);
        if ($err) {
            $this->fail($err, 422, ['image' => $err]);
        }
        $this->User_avatar_model->put($this->uid(), $mime, $bin, $data_url);
        $user = $this->User_model->find_by_id($this->uid());
        $this->ok(['message' => 'Profile picture saved', 'user' => $this->payload($user)]);
    }

    public function photo_delete()
    {
        $this->api->require_method('DELETE');
        $this->User_avatar_model->remove($this->uid());
        $user = $this->User_model->find_by_id($this->uid());
        $this->ok(['message' => 'Profile picture removed', 'user' => $this->payload($user)]);
    }
}
