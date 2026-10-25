<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * CronController - scheduled jobs (middleware: cron = X-Cron-Token header).
 *   POST /api/cron/reminders   e-mail every tenant whose bill is due within 3 days or overdue
 *                              (at most one reminder per bill every 72 hours)
 * Point a Render Cron Job at it:  curl -X POST -H "X-Cron-Token: $CRON_TOKEN" https://<api>/api/cron/reminders
 */
class CronController extends BaseApiController
{
    public function reminders()
    {
        $this->api->require_method('POST');
        $this->call->model(['Bill_model', 'Notification_model']);
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
