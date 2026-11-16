<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class WebhookController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Payment_model');
    }

    public function paymongo()
    {
        $this->api->require_method('POST');
        $event = json_decode((string) Req_context::get('webhook_raw'), true);
        $type  = $event['data']['attributes']['type'] ?? '';

        if ($type !== 'checkout_session.payment.paid') {
            $this->ok(['received' => true, 'ignored' => $type]);
        }

        $session     = $event['data']['attributes']['data'] ?? [];
        $checkout_id = $session['id'] ?? '';
        $pay         = $session['attributes']['payments'][0] ?? null;

        $payment = $checkout_id !== '' ? $this->Payment_model->find_by_checkout($checkout_id) : null;
        if (!$payment) {
            $this->ok(['received' => true, 'ignored' => 'unknown checkout']);
        }
        $paid_centavos = (int) ($pay['attributes']['amount'] ?? 0);
        if ($paid_centavos !== (int) round(((float) $payment['amount']) * 100)) {
            $this->ok(['received' => true, 'ignored' => 'amount mismatch']);
        }

        if ($this->Payment_model->settle($payment['id'], $pay['id'] ?? null)) {
            $this->call->library('notifier');
            $this->notifier->payment_confirmation($payment['id']);
        }
        $this->ok(['received' => true]);
    }
}
