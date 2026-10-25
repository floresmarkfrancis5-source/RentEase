<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/**
 * PaymentController
 *   admin:  GET /api/admin/payments, POST /api/admin/payments  (record a cash / bank-transfer payment)
 *   shared: GET /api/payments/{id}/receipt  (PDF; the landlord, or the tenant who paid)
 */
class PaymentController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Payment_model', 'Bill_model']);
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q = $this->api->get_query_params();
        $f = in_array($q['status'] ?? '', ['pending', 'paid', 'failed'], true) ? ['status' => $q['status']] : [];
        $f['landlord_id'] = $this->uid();
        $rows = $this->Payment_model->list_payments($f);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    /** POST /api/admin/payments { bill_id, method: cash|bank_transfer, notes } - landlord received money offline. */
    public function store()
    {
        $this->api->require_method('POST');
        $d = $this->validate($this->input(), [
            'bill_id' => ['type' => 'int', 'required' => true, 'min' => 1],
            'method'  => ['type' => 'enum', 'values' => ['cash', 'bank_transfer'], 'default' => 'cash'],
            'notes'   => ['type' => 'string', 'max' => 255, 'nullable' => true],
        ]);
        $bill = $this->not_found_unless($this->Bill_model->find($d['bill_id'], $this->uid()), 'Bill');
        if ($bill['status'] === 'paid') {
            $this->fail('This bill is already paid.', 409);
        }
        $this->Payment_model->cancel_stale_pending($bill['id']);
        $pid = $this->Payment_model->create_pending($bill['id'], $bill['tenant_id'], $bill['amount'], $d['method'], $this->uid(), $d['notes'] ?? null);
        $this->Payment_model->settle($pid);

        $this->call->library('notifier');
        $this->notifier->payment_confirmation($pid);
        $this->ok(['message' => 'Payment recorded and receipt issued', 'data' => $this->Payment_model->find($pid, $this->uid())], 201);
    }

    /** GET /api/payments/{id}/receipt - official receipt PDF. */
    public function receipt($id)
    {
        $this->api->require_method('GET');
        $p = $this->Payment_model->find($id, $this->admin() ? $this->uid() : null);
        if (!$p || (!$this->admin() && (int) $p['tenant_id'] !== $this->uid())) {
            $this->fail('Payment not found.', 404);
        }
        if ($p['status'] !== 'paid') {
            $this->fail('A receipt is only available once the payment is complete.', 409);
        }
        $this->call->library('notifier');
        $this->call->library('pdf');
        try {
            $pdf = $this->pdf->render('pdf/receipt', $this->notifier->receipt_data($p));
        } catch (Throwable $e) {
            $this->fail('The PDF could not be generated.', 500);
        }
        $this->pdf->download($pdf, $p['receipt_no'] . '.pdf');
    }
}
