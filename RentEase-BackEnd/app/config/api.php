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

$config['api_helper_enabled'] = filter_var(getenv('API_ENABLED') ?: 'true', FILTER_VALIDATE_BOOLEAN);

$config['payload_token_expiration'] = 900;

$config['refresh_token_expiration'] = 604800;

$config['jwt_secret'] = getenv('JWT_SECRET') ?: '';

$config['refresh_token_key'] = getenv('REFRESH_TOKEN_KEY') ?: '';

$config['jwt_verify_user'] = FALSE;

$config['users_table'] = 'users';

$_cors_origin = trim((string) (getenv('CORS_ORIGIN') ?: '*'));
$config['allow_origin'] = ($_cors_origin === '*')
    ? '*'
    : array_values(array_filter(array_map('trim', explode(',', $_cors_origin))));
unset($_cors_origin);

$config['refresh_token_table'] = 'refresh_tokens';

$config['jwt_issuer'] = getenv('JWT_ISSUER') ?: 'product-management-api';

$config['jwt_audience'] = getenv('JWT_AUDIENCE') ?: 'product-management-clients';

$config['rate_limit_enabled'] = true;

$config['rate_limit_requests'] = 120;

$config['rate_limit_seconds'] = 60;