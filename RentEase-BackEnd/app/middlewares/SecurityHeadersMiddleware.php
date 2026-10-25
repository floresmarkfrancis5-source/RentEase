<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * SecurityHeadersMiddleware (global)
 * Adds hardening headers to every response and stops browsers/proxies from caching API data.
 */
class SecurityHeadersMiddleware
{
    public function handle($next)
    {
        if (!headers_sent()) {
            header_remove('X-Powered-By');
            header('X-Content-Type-Options: nosniff');
            header('X-Frame-Options: DENY');
            header('Referrer-Policy: no-referrer');
            header('Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()');
            header('Cross-Origin-Resource-Policy: cross-origin');
            // The API only returns JSON/PDF - it never needs to run scripts or load other resources.
            header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
            header('Cache-Control: no-store, max-age=0');
            header('Pragma: no-cache');
            if (is_https()) {
                header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
            }
        }
        return $next();
    }
}
