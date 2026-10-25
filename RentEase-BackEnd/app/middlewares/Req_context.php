<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Req_context - tiny per-request holder used to hand data from a middleware to the controller.
 * (The routed controller is created AFTER the middleware pipeline runs, so a static holder is the
 * simplest place to keep the authenticated user.)
 */
class Req_context
{
    private static $data = [];

    public static function set($key, $value) { self::$data[$key] = $value; }
    public static function get($key, $default = null) { return self::$data[$key] ?? $default; }

    public static function user()    { return self::get('user'); }
    public static function user_id() { return (int) (self::get('user')['id'] ?? 0); }
    public static function role()    { return (string) (self::get('user')['role'] ?? ''); }
    public static function is_admin(){ return self::role() === 'admin'; }

    /** Stop the request with a JSON error (used by middlewares that run before any controller). */
    public static function deny($code, $message)
    {
        http_response_code($code);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['error' => $message, 'status' => $code]);
        exit;
    }
}
