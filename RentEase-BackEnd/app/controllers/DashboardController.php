<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/** DashboardController (admin) - collected / outstanding / overdue summary + notification log. */
class DashboardController extends BaseApiController
{
    public function index()
    {
        $this->api->require_method('GET');
        $this->call->model('Report_model');
        $this->ok(['data' => $this->Report_model->dashboard($this->uid())]);
    }

    public function notifications()
    {
        $this->api->require_method('GET');
        $this->call->model('Notification_model');
        $rows = $this->Notification_model->recent(100, $this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }
}
