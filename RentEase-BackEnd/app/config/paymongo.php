<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['paymongo_secret_key'] = getenv('PAYMONGO_SECRET_KEY') ?: '';
$config['paymongo_webhook_secret'] = getenv('PAYMONGO_WEBHOOK_SECRET') ?: '';
$config['paymongo_methods'] = getenv('PAYMONGO_METHODS') ?: 'card,gcash,paymaya';
$config['paymongo_api_url'] = getenv('PAYMONGO_API_URL') ?: 'https://api.paymongo.com/v1';
$config['paymongo_allow_live'] = filter_var(getenv('PAYMONGO_ALLOW_LIVE') ?: 'false', FILTER_VALIDATE_BOOLEAN);
