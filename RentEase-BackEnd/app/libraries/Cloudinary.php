<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Cloudinary Library - Uploads and hosts images on Cloudinary CDN for instant loading worldwide.
 */
class Cloudinary
{
    private $_lava;
    private $cloud_name;
    private $api_key;
    private $api_secret;
    private $upload_preset;

    public function __construct()
    {
        $this->_lava = lava_instance();
        $this->_lava->config->load('cloudinary');

        $this->cloud_name    = config_item('cloudinary_cloud_name') ?: getenv('CLOUDINARY_CLOUD_NAME') ?: '';
        $this->api_key       = config_item('cloudinary_api_key') ?: getenv('CLOUDINARY_API_KEY') ?: '';
        $this->api_secret    = config_item('cloudinary_api_secret') ?: getenv('CLOUDINARY_API_SECRET') ?: '';
        $this->upload_preset = getenv('CLOUDINARY_UPLOAD_PRESET') ?: '';
    }

    public function configured()
    {
        return !empty($this->cloud_name) && (!empty($this->upload_preset) || (!empty($this->api_key) && !empty($this->api_secret)));
    }

    /**
     * Upload an image (base64 data URL or file path) to Cloudinary.
     * @param string $file_or_data_url
     * @param string $folder
     * @return array [ 'url' => string|null, 'public_id' => string|null, 'error' => string|null ]
     */
    public function upload($file_or_data_url, $folder = 'rentease/maintenance')
    {
        if (!$this->configured()) {
            return ['url' => null, 'error' => 'Cloudinary is not configured.'];
        }

        $endpoint = "https://api.cloudinary.com/v1_1/{$this->cloud_name}/image/upload";
        $post_fields = [
            'file'   => $file_or_data_url,
            'folder' => $folder,
        ];

        // If an unsigned upload preset is provided, use it directly (no signature needed)
        if (!empty($this->upload_preset)) {
            $post_fields['upload_preset'] = $this->upload_preset;
        } else {
            $timestamp = time();
            $params = [
                'folder'    => $folder,
                'timestamp' => $timestamp,
            ];
            ksort($params);

            // Construct string to sign: key1=value1&key2=value2
            $sign_pairs = [];
            foreach ($params as $k => $v) {
                $sign_pairs[] = "{$k}={$v}";
            }
            $string_to_sign = implode('&', $sign_pairs);
            $signature = sha1($string_to_sign . $this->api_secret);

            $post_fields['api_key']   = $this->api_key;
            $post_fields['timestamp'] = $timestamp;
            $post_fields['signature'] = $signature;
        }

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);

        $raw = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_err  = curl_error($ch);
        curl_close($ch);

        if ($curl_err) {
            return ['url' => null, 'error' => "cURL error: {$curl_err}"];
        }

        $json = json_decode($raw, true);
        if ($http_code >= 200 && $http_code < 300 && !empty($json['secure_url'])) {
            return [
                'url'       => $json['secure_url'],
                'public_id' => $json['public_id'] ?? null,
                'error'     => null,
            ];
        }

        $err_msg = $json['error']['message'] ?? "Upload failed with HTTP code {$http_code}";
        return ['url' => null, 'error' => $err_msg];
    }
}
