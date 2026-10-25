<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['google_auth_client_id'] = getenv('GOOGLE_CLIENT_ID') ?: '';
$config['google_auth_tokeninfo_url'] = getenv('GOOGLE_TOKENINFO_URL') ?: 'https://oauth2.googleapis.com/tokeninfo';
