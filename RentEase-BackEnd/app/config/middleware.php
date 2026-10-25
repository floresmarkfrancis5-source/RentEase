<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
/**
 * ------------------------------------------------------------------
 * LavaLust - an opensource lightweight PHP MVC Framework
 * ------------------------------------------------------------------
 *
 * MIT License
 *
 * Copyright (c) 2020 Ronald M. Marasigan
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * @package LavaLust
 * @author Ronald M. Marasigan <ronald.marasigan@yahoo.com>
 * @since Version 4
 * @link https://github.com/ronmarasigan/LavaLust
 * @license https://opensource.org/licenses/MIT MIT License
 */
/*
|--------------------------------------------------------------------------
| Adding of middlewares
|--------------------------------------------------------------------------
|
| Used for adding middlewares
|
*/
/*
| Every middleware class lives in app/middlewares/ and exposes handle($next).
| The array KEY is the name used in routes.php:
|     $router->add_global_middleware(['security_headers', 'throttle', 'json_only']);
|     $router->get('api/x', 'X::y')->middleware('auth');
|     $router->group(['middleware' => ['auth', 'admin']], function ($router) { ... });
*/
$mw = APP_DIR . 'middlewares/';
require_once $mw . 'Req_context.php';
require_once $mw . 'SecurityHeadersMiddleware.php';
require_once $mw . 'ThrottleMiddleware.php';
require_once $mw . 'JsonOnlyMiddleware.php';
require_once $mw . 'AuthMiddleware.php';
require_once $mw . 'RoleMiddleware.php';
require_once $mw . 'PaymongoWebhookMiddleware.php';
require_once $mw . 'CronMiddleware.php';
require_once $mw . 'DevOnlyMiddleware.php';

$config['middlewares'] = [
    // --- global (applied to every route) ---
    'security_headers' => new SecurityHeadersMiddleware(),   // nosniff, frame-deny, CSP, HSTS, no-store
    'throttle'         => new ThrottleMiddleware(120, 60, 'global'),   // 120 requests / minute / IP
    'json_only'        => new JsonOnlyMiddleware(),          // bodies must be application/json (415)

    // --- authentication & authorisation ---
    'throttle_auth'    => new ThrottleMiddleware(10, 60, 'auth'),      // 10 login attempts / minute / IP
    'auth'             => new AuthMiddleware(),              // valid JWT + active account (401)
    'admin'            => new RoleMiddleware('admin'),       // landlord only (403)
    'tenant'           => new RoleMiddleware('tenant'),      // tenant only (403)
    'superadmin'       => new RoleMiddleware('superadmin'),  // platform account administration (403)

    // --- special endpoints ---
    'paymongo_webhook' => new PaymongoWebhookMiddleware(),   // HMAC signature check
    'cron'             => new CronMiddleware(),              // X-Cron-Token header
    'dev_only'         => new DevOnlyMiddleware(),           // migration URLs: local only
];
