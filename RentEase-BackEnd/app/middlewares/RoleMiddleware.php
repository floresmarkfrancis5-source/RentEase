<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * RoleMiddleware - role-based access control (RBAC).
 *   'admin'  => new RoleMiddleware('admin')    landlord / property manager area
 *   'tenant' => new RoleMiddleware('tenant')   tenant portal
 * Must run AFTER 'auth'. Wrong role -> 403.
 */
class RoleMiddleware
{
    private $role;

    public function __construct($role)
    {
        $this->role = $role;
    }

    public function handle($next)
    {
        if (Req_context::user() === null) {
            Req_context::deny(401, 'Unauthorized');
        }
        if (Req_context::role() !== $this->role) {
            Req_context::deny(403, 'Forbidden: this action is for ' . $this->role . ' accounts only');
        }
        return $next();
    }
}
