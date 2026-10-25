<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/** InAppNotificationController - role-scoped notifications for the current account. */
class InAppNotificationController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Inapp_notification_model');
    }

    public function index()
    {
        $this->api->require_method('GET');
        $rows = $this->Inapp_notification_model->list_for_user($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function unread_count()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => ['count' => $this->Inapp_notification_model->unread_count($this->uid())]]);
    }

    public function mark_read($id)
    {
        $this->api->require_method('PATCH');
        if (!$this->Inapp_notification_model->belongs_to_user($id, $this->uid())) {
            $this->fail('Notification not found.', 404);
        }
        $this->Inapp_notification_model->mark_read($id, $this->uid());
        $this->ok(['message' => 'Notification marked as read']);
    }

    public function mark_all_read()
    {
        $this->api->require_method('PATCH');
        $count = $this->Inapp_notification_model->mark_all_read($this->uid());
        $this->ok(['message' => 'Notifications marked as read', 'count' => $count]);
    }
}
