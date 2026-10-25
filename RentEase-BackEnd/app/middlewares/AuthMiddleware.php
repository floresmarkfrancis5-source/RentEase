<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * AuthMiddleware - requires a valid Bearer (JWT) access token.
 * The Api library re-reads the user's role from the database on every call (jwt_verify_user = TRUE),
 * so disabled accounts lose access immediately. Tenants also lose access when their landlord is disabled.
 */
class AuthMiddleware
{
    public function handle($next)
    {
        $api     = lava_instance()->call->library('api');
        $payload = $api->require_jwt();               // 401 + exit when missing / invalid / expired

        $db   = lava_instance()->db;
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
