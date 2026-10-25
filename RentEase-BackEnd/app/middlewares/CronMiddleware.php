<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * CronMiddleware - protects scheduled-job endpoints (e.g. due-date reminders).
 * The caller (a Render Cron Job) must send header  X-Cron-Token: <CRON_TOKEN env value>.
 */
class CronMiddleware
{
    public function handle($next)
    {
        lava_instance()->config->load('security');
        $token = (string) config_item('security_cron_token');
        if (strlen($token) < 24) {
            Req_context::deny(503, 'CRON_TOKEN is not configured (needs at least 24 characters)');
        }
        $given = (string) ($_SERVER['HTTP_X_CRON_TOKEN'] ?? '');
        if (!hash_equals($token, $given)) {
            Req_context::deny(403, 'Forbidden');
        }
        return $next();
    }
}
