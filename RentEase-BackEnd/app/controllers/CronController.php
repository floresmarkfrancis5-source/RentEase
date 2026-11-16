<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class CronController extends BaseApiController
{
    public function reminders()
    {
        $this->api->require_method('POST');
        $this->call->model(['Bill_model', 'Notification_model', 'Lease_model']);
        $this->Lease_model->sync_lifecycle();
        $this->call->library('notifier');

        $counts = ['checked' => 0, 'sent' => 0, 'skipped' => 0, 'failed' => 0, 'already_reminded' => 0];
        foreach ($this->Bill_model->due_soon(3) as $bill) {
            $counts['checked']++;
            if ($this->Notification_model->sent_recently('due_reminder', $bill['id'], 72)) {
                $counts['already_reminded']++;
                continue;
            }
            $r = $this->notifier->due_reminder($bill['id']);
            $counts[$r === 'sent' ? 'sent' : ($r === 'failed' ? 'failed' : 'skipped')]++;
        }
        $this->ok(['message' => 'Reminders processed'] + $counts);
    }
}
