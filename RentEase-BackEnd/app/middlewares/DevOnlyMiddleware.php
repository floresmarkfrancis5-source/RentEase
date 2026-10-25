<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * DevOnlyMiddleware - the migration URLs (/migrate, /rollback-all, /refresh ...) can wipe the database.
 * They only answer when MIGRATION_ENABLED=true AND APP_ENV is not "production"; otherwise they look
 * like they do not exist (404).
 */
class DevOnlyMiddleware
{
    public function handle($next)
    {
        lava_instance()->config->load('migration');
        $enabled = (bool) config_item('migration_enabled');
        $prod    = strtolower((string) config_item('environment')) === 'production';
        if (!$enabled || $prod) {
            Req_context::deny(404, 'Not found');
        }
        return $next();
    }
}
