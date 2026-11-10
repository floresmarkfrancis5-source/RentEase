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
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
        $is_media = preg_match('#/api/(?:maintenance/images|profile/photo|assets)#', $path);

        if (!headers_sent()) {
            header_remove('X-Powered-By');
            header('Connection: close');
            if (!$is_media) {
                header('X-Content-Type-Options: nosniff');
                header('X-Frame-Options: DENY');
                header('Referrer-Policy: no-referrer');
                header('Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()');
                header('Cross-Origin-Resource-Policy: cross-origin');
                header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
                header('Cache-Control: no-store, max-age=0');
                header('Pragma: no-cache');
            } else {
                header('Cross-Origin-Resource-Policy: cross-origin');
                header('Access-Control-Allow-Origin: *');
            }
            if (is_https()) {
                header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
            }
        }
        return $next();
    }
}
