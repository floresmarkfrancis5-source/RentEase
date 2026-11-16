<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class Google_auth
{
    public function configured()
    {
        return (string) config_item('google_auth_client_id') !== '';
    }

    public function verify($id_token)
    {
        if (!$this->configured() || !is_string($id_token) || strlen($id_token) < 20 || strlen($id_token) > 4096) {
            return null;
        }
        $url = rtrim((string) config_item('google_auth_tokeninfo_url'), '/') . '?id_token=' . rawurlencode($id_token);
        $ch  = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code !== 200) {
            return null;
        }
        $t = json_decode($raw, true);
        if (!is_array($t)) {
            return null;
        }
        $verified = ($t['email_verified'] ?? '') === true || ($t['email_verified'] ?? '') === 'true';
        if (($t['aud'] ?? '') !== config_item('google_auth_client_id') || !$verified || empty($t['email']) || empty($t['sub'])) {
            return null;
        }
        if (isset($t['exp']) && (int) $t['exp'] < time()) {
            return null;
        }
        return ['sub' => (string) $t['sub'], 'email' => strtolower($t['email']), 'name' => $t['name'] ?? ''];
    }
}
