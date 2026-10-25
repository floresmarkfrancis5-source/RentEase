<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['security_cron_token'] = getenv('CRON_TOKEN') ?: '';
