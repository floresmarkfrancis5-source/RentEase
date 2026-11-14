<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['gemini_api_key'] = getenv('GEMINI_API_KEY') ?: '';
$config['gemini_model'] = getenv('GEMINI_MODEL') ?: 'gemini-3.5-flash-lite';
$config['gemini_api_url'] = getenv('GEMINI_API_URL') ?: 'https://generativelanguage.googleapis.com/v1beta';
$config['assistant_debug'] = filter_var(getenv('ASSISTANT_DEBUG') ?: false, FILTER_VALIDATE_BOOLEAN);
