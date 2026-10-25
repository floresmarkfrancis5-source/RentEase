<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * BillController - monthly billing.
 *   admin:  GET /api/admin/bills, GET /api/admin/bills/{id}, POST /api/admin/bills/generate,
 *           POST /api/admin/bills/{id}/remind, DELETE /api/admin/bills/{id}
 *   shared: GET /api/bills/{id}/statement   (PDF; the landlord, or the tenant who owns the bill)
 */
class BillController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Bill_model', 'Payment_model']);
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q = $this->api->get_query_params();
        $f = [];
        if (in_array($q['status'] ?? '', ['unpaid', 'paid', 'overdue'], true)) $f['status'] = $q['status'];
        if (preg_match('/^\d{4}-\d{2}$/', $q['month'] ?? ''))                   $f['month'] = $q['month'];
        if (ctype_digit((string) ($q['tenant_id'] ?? '')))                     $f['tenant_id'] = $q['tenant_id'];
        $f['landlord_id'] = $this->uid();
        $rows = $this->Bill_model->list_bills($f);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $bill = $this->not_found_unless($this->Bill_model->find($id, $this->uid()), 'Bill');
        $bill['payments'] = $this->Payment_model->list_payments(['tenant_id' => $bill['tenant_id']]);
        $bill['payments'] = array_values(array_filter($bill['payments'], function ($p) use ($id) { return (int) $p['bill_id'] === (int) $id; }));
        $this->ok(['data' => $bill]);
    }

    /** POST /api/admin/bills/generate  { "month": "2026-11" }  - safe to run twice (no duplicates). */
    public function generate()
    {
        $this->api->require_method('POST');
        $in    = $this->input();
        $month = trim((string) ($in['month'] ?? date('Y-m')));
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
            $this->fail('Use the month format YYYY-MM.', 422, ['month' => 'Use the format YYYY-MM.']);
        }
        if ($month > date('Y-m', strtotime('+2 months'))) {
            $this->fail('You can only bill up to two months ahead.', 422, ['month' => 'Too far in the future.']);
        }
        $created_bills = [];
        $r = $this->Bill_model->generate_month($month, $created_bills, $this->uid());
        if ($created_bills) {
            $this->call->model('Inapp_notification_model');
            foreach ($created_bills as $bill) {
                $this->Inapp_notification_model->create(
                    $bill['tenant_id'], 'new_bill', 'New rent bill',
                    'Your rent for ' . $bill['period'] . ' · ' . $bill['unit_name'] . ' is ready.',
                    $bill['id']
                );
            }
        }
        $this->ok(['message' => "{$r['created']} bill(s) created, {$r['skipped']} already existed.", 'month' => $month] + $r);
    }

    public function remind($id)
    {
        $this->api->require_method('POST');
        $bill = $this->not_found_unless($this->Bill_model->find($id, $this->uid()), 'Bill');
        if ($bill['status'] === 'paid') {
            $this->fail('This bill is already paid.', 409);
        }
        $this->call->library('notifier');
        $result = $this->notifier->due_reminder($id);
        $msg = ['sent' => 'Reminder e-mailed to the tenant.', 'skipped' => 'E-mail is not configured on the server, so nothing was sent.', 'failed' => 'The e-mail could not be sent. See Notifications.'];
        $this->ok(['message' => $msg[$result] ?? $result, 'result' => $result]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->Bill_model->find($id, $this->uid()), 'Bill');
        if ($this->Bill_model->has_paid_payment($id)) {
            $this->fail('A paid bill cannot be deleted because it has a receipt.', 409);
        }
        $this->Bill_model->delete_bill($id);
        $this->ok(['message' => 'Bill deleted']);
    }

    /** GET /api/bills/{id}/statement - PDF billing statement. */
    public function statement($id)
    {
        $this->api->require_method('GET');
        $bill = $this->not_found_unless($this->Bill_model->find($id, $this->admin() ? $this->uid() : null), 'Bill');
        if (!$this->admin() && (int) $bill['tenant_id'] !== $this->uid()) {
            $this->fail('Bill not found.', 404);   // do not reveal that it exists
        }
        $this->call->library('notifier');
        $this->call->library('pdf');
        try {
            $pdf = $this->pdf->render('pdf/statement', $this->notifier->statement_data($bill));
        } catch (Throwable $e) {
            $this->fail('The PDF could not be generated.', 500);
        }
        $this->pdf->download($pdf, 'statement-' . $bill['period_month'] . '-' . $bill['id'] . '.pdf');
    }
}
