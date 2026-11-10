<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

$config['cloudinary_cloud_name'] = getenv('CLOUDINARY_CLOUD_NAME') ?: '';
$config['cloudinary_api_key']    = getenv('CLOUDINARY_API_KEY') ?: '';
$config['cloudinary_api_secret'] = getenv('CLOUDINARY_API_SECRET') ?: '';
