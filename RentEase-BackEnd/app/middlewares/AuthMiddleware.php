<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * AuthMiddleware - requires a valid Bearer (JWT) access token.
 * The middleware loads the user's live role and account status in one database query,
 * including the active status of the landlord for tenant accounts.
 */
class AuthMiddleware
{
    public function handle($next)
    {
        if (empty($_SERVER['HTTP_AUTHORIZATION']) && empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) && !empty($_GET['token'])) {
            $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $_GET['token'];
        }
        $api     = lava_instance()->call->library('api');
        $payload = $api->require_jwt();               // 401 + exit when missing / invalid / expired

        $lava = lava_instance();
        $db   = $lava->call->database();
        $user = $db->raw(
            "SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active, u.landlord_id
               FROM users u
          LEFT JOIN users landlord ON landlord.id = u.landlord_id
              WHERE u.id = ? AND u.is_active = 1
                AND (u.role <> 'tenant' OR (landlord.id IS NOT NULL AND landlord.is_active = 1))
              LIMIT 1",
            [(int) $payload['sub']]
        )->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            Req_context::deny(401, 'Unauthorized');
        }

        Req_context::set('user', $user);
        return $next();
    }
}
