<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/**
 * AssetController - serves the site images (logo, hero, login) that the admin uploaded.
 *   GET /api/assets/{key}      public (these images are shown on the public homepage)
 * The URL stored in the settings carries ?v=<timestamp>, so the browser can cache it "forever"
 * and a new upload still shows up immediately.
 */
class AssetController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Site_asset_model');
    }

    public function show($key)
    {
        $this->api->require_method('GET');
        if (!isset(Site_asset_model::KEYS[$key])) {
            $this->fail('Not found.', 404);
        }
        $row = $this->Site_asset_model->get($key);
        if (!$row) {
            $this->fail('Not found.', 404);
        }

        $etag = '"' . md5($key . $row['ts'] . $row['byte_size']) . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: public, max-age=31536000, immutable');
        header_remove('Pragma');
        if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
            http_response_code(304);
            exit;
        }
        header('Content-Type: ' . $row['mime']);
        header('Content-Length: ' . strlen($row['data']));
        echo $row['data'];
        exit;
    }
}
