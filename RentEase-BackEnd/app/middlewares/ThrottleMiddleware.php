<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * ThrottleMiddleware - rate limiting per client IP (uses the Api library's cache-backed limiter).
 *   'throttle'       global limit for every request
 *   'throttle_auth'  much stricter limit for login / google / refresh (brute-force protection)
 * Responds 429 with Retry information once the limit is exceeded.
 */
class ThrottleMiddleware
{
    private $limit;
    private $seconds;
    private $bucket;

    public function __construct($limit = 120, $seconds = 60, $bucket = 'global')
    {
        $this->limit   = $limit;
        $this->seconds = $seconds;
        $this->bucket  = $bucket;
    }

    public function handle($next)
    {
        $api = lava_instance()->call->library('api');
        $ip  = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $api->rate_limit($this->bucket . '_' . $ip, $this->limit, $this->seconds);
        return $next();
    }
}
