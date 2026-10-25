<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * PaymongoWebhookMiddleware - only genuine PayMongo calls may reach the webhook controller.
 *
 * PayMongo signs every webhook:  Paymongo-Signature: t=<timestamp>,te=<test sig>,li=<live sig>
 * where the signature = HMAC-SHA256( "<timestamp>.<raw body>", WEBHOOK_SECRET ).
 * We recompute it, compare in constant time and reject stale timestamps (replay protection).
 */
class PaymongoWebhookMiddleware
{
    const TOLERANCE_SECONDS = 300;

    public function handle($next)
    {
        lava_instance()->config->load('paymongo');
        $secret = (string) config_item('paymongo_webhook_secret');
        if ($secret === '') {
            Req_context::deny(503, 'Webhook secret is not configured');
        }

        $header = $_SERVER['HTTP_PAYMONGO_SIGNATURE'] ?? '';
        $parts  = [];
        foreach (explode(',', $header) as $piece) {
            $kv = explode('=', trim($piece), 2);
            if (count($kv) === 2) {
                $parts[$kv[0]] = $kv[1];
            }
        }
        $timestamp = $parts['t'] ?? '';
        if ($timestamp === '' || !ctype_digit($timestamp)) {
            Req_context::deny(400, 'Missing signature');
        }
        if (abs(time() - (int) $timestamp) > self::TOLERANCE_SECONDS) {
            Req_context::deny(400, 'Signature timestamp is outside the allowed window');
        }

        $raw      = file_get_contents('php://input');
        $expected = hash_hmac('sha256', $timestamp . '.' . $raw, $secret);
        $given    = [$parts['te'] ?? '', $parts['li'] ?? ''];

        $valid = false;
        foreach ($given as $sig) {
            if ($sig !== '' && hash_equals($expected, $sig)) {
                $valid = true;
            }
        }
        if (!$valid) {
            Req_context::deny(401, 'Invalid signature');
        }

        Req_context::set('webhook_raw', $raw);
        return $next();
    }
}
