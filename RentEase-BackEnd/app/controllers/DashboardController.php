<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

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

    public function landlord_report()
    {
        $this->api->require_method('GET');
        $this->call->model('Report_model');
        header('Cache-Control: no-store');
        $this->ok(['data' => $this->Report_model->landlord_report($this->uid())]);
    }

    public function report_summary()
    {
        $this->api->require_method('GET');
        $this->call->model('Report_model');
        $metrics = $this->Report_model->landlord_report_summary_metrics($this->uid());
        $this->call->library('gemini');
        if (!$this->gemini->configured()) {
            $this->fail('Gemini is not configured. The factual report is still available without an AI summary.', 503);
        }
        try {
            $summary = $this->gemini->summarize_landlord_report($metrics);
        } catch (RuntimeException $e) {
            $this->fail('The AI report summary could not be generated: ' . $e->getMessage(), 502);
        }
        $this->ok(['data' => $summary]);
    }
}
