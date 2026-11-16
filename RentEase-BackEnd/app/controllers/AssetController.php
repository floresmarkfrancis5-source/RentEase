<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

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
        $owner_id = filter_var($_GET['owner'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($owner_id === false || $owner_id === null) {
            $this->fail('Not found.', 404);
        }
        $row = $this->Site_asset_model->get($key, $owner_id);
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
