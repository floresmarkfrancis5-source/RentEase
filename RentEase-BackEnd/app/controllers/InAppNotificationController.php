<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** InAppNotificationController - role-scoped notifications for the current account. */
class InAppNotificationController extends BaseApiController
{
    private const SIDEBAR_SECTIONS = [
        'leases' => ['new_lease'],
        'bills' => ['new_bills'],
        'payments' => ['payment_received'],
        'maintenance' => ['new_maintenance_request'],
        'transfers' => ['new_transfer_request', 'new_early_move_request'],
    ];

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

    public function sidebar_counts()
    {
        $this->api->require_method('GET');
        $byType = $this->Inapp_notification_model->unread_counts_by_type($this->uid());
        $counts = [];
        foreach (self::SIDEBAR_SECTIONS as $section => $types) {
            $counts[$section] = array_sum(array_map(
                static function ($type) use ($byType) { return (int) ($byType[$type] ?? 0); },
                $types
            ));
        }
        $this->ok(['data' => $counts]);
    }

    public function mark_section_read($section)
    {
        $this->api->require_method('PATCH');
        if (!isset(self::SIDEBAR_SECTIONS[$section])) {
            $this->fail('Notification section not found.', 404);
        }
        $count = $this->Inapp_notification_model->mark_types_read(
            $this->uid(),
            self::SIDEBAR_SECTIONS[$section]
        );
        $this->ok(['message' => 'Section notifications marked as read.', 'count' => $count]);
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
