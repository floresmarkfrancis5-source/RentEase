<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * JsonOnlyMiddleware (global)
 * Requests that carry a body (POST/PUT/PATCH) must be application/json - rejects other content types
 * with 415, which blocks form-based cross-site requests and unexpected payload formats.
 */
class JsonOnlyMiddleware
{
    public function handle($next)
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
            $type   = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
            // JSON API requests are capped at 1 MB, except compressed site images and lease PDFs.
            $path  = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
            if (preg_match('#/api/admin/settings/image/?$#', $path)) {
                $limit = 4 * 1048576;
            } elseif (preg_match('#/api/admin/leases/\d+/documents/?$#', $path)) {
                $limit = 7 * 1048576;
            } elseif (preg_match('#/api/(?:my|admin)/maintenance#', $path)) {
                $limit = 15 * 1048576;
            } else {
                $limit = 1048576;
            }
            if ($length > $limit) {
                Req_context::deny(413, 'Payload too large');
            }
            if ($length > 0 && strpos($type, 'application/json') !== 0) {
                Req_context::deny(415, 'Content-Type must be application/json');
            }
        }
        return $next();
    }
}
