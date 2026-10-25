<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['mailer_smtp_host'] = getenv('SMTP_HOST') ?: '';
$config['mailer_smtp_port'] = (int) (getenv('SMTP_PORT') ?: 587);
$config['mailer_smtp_user'] = getenv('SMTP_USER') ?: '';
$config['mailer_smtp_pass'] = getenv('SMTP_PASS') ?: '';
$config['mailer_smtp_secure'] = strtolower(getenv('SMTP_SECURE') ?: 'tls');
$config['mailer_from'] = getenv('MAIL_FROM') ?: 'no-reply@rentease.local';
$config['mailer_from_name'] = getenv('MAIL_FROM_NAME') ?: 'RentEase';
