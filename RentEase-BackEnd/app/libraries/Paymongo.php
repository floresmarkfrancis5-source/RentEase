<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Paymongo - small client for the PayMongo Checkout API (online rent payment).
 *
 * Settings are loaded from app/config/paymongo.php (values are supplied through .env).
 * PAYMONGO_SECRET_KEY should be an sk_test_... key for test mode.
 * The secret key only ever lives on the server - the React app never sees it.
 */
class Paymongo
{
    public function configured()
    {
        return (string) config_item('paymongo_secret_key') !== '';
    }

    private function base()
    {
        return rtrim((string) config_item('paymongo_api_url'), '/');
    }

    /** 'test' for sk_test_ keys, 'live' for sk_live_ keys (real money!). */
    public function mode()
    {
        return strpos((string) config_item('paymongo_secret_key'), 'sk_live_') === 0 ? 'live' : 'test';
    }

    /**
     * Safety net for school projects: a LIVE key would charge real money, so it is refused
     * unless PAYMONGO_ALLOW_LIVE=true is set on purpose.
     */
    private function guard_test_mode()
    {
        if ($this->mode() === 'live' && !config_item('paymongo_allow_live')) {
            throw new RuntimeException('Live PayMongo keys are blocked. Use your sk_test_ key so no real money is charged.');
        }
    }

    /** @return array decoded JSON. Throws RuntimeException with PayMongo's message on failure. */
    private function call($method, $path, $body = null)
    {
        $this->guard_test_mode();
        $ch = curl_init($this->base() . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                'Content-Type: application/json',
                'Authorization: Basic ' . base64_encode(config_item('paymongo_secret_key') . ':'),
            ],
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        $raw  = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException('Cannot reach PayMongo: ' . $err);
        }
        $json = json_decode($raw, true);
        if ($code >= 400 || !is_array($json)) {
            $msg = $json['errors'][0]['detail'] ?? ('PayMongo error ' . $code);
            throw new RuntimeException($msg);
        }
        return $json;
    }

    /**
     * Create a hosted checkout page for one bill.
     * @return array ['id' => 'cs_...', 'checkout_url' => 'https://checkout.paymongo.com/...']
     */
    public function create_checkout(array $bill, $payment_id, $success_url, $cancel_url)
    {
        $methods = array_values(array_filter(array_map('trim', explode(',', (string) config_item('paymongo_methods')))));
        $res = $this->call('POST', '/checkout_sessions', ['data' => ['attributes' => [
            'line_items' => [[
                'currency'    => 'PHP',
                'amount'      => (int) round(((float) $bill['amount']) * 100),   // centavos
                'name'        => $bill['description'],
                'quantity'    => 1,
            ]],
            'payment_method_types' => $methods,
            'description'      => $bill['description'],
            'reference_number' => 'BILL-' . $bill['id'] . '-PAY-' . $payment_id,
            'success_url'      => $success_url,
            'cancel_url'       => $cancel_url,
            'send_email_receipt' => false,
            'metadata'         => ['bill_id' => (string) $bill['id'], 'payment_id' => (string) $payment_id],
        ]]]);
        return [
            'id'           => $res['data']['id'],
            'checkout_url' => $res['data']['attributes']['checkout_url'],
        ];
    }

    /**
     * Ask PayMongo what happened to a checkout session (used when the webhook is late or missing).
     * @return array ['paid' => bool, 'payment_id' => ?string, 'amount' => ?int centavos]
     */
    public function get_checkout($checkout_id)
    {
        $res   = $this->call('GET', '/checkout_sessions/' . rawurlencode($checkout_id));
        $attrs = $res['data']['attributes'] ?? [];
        $pay   = $attrs['payments'][0] ?? null;
        $paid  = $pay && (($pay['attributes']['status'] ?? '') === 'paid');
        return [
            'paid'       => (bool) $paid,
            'payment_id' => $pay['id'] ?? null,
            'amount'     => isset($pay['attributes']['amount']) ? (int) $pay['attributes']['amount'] : null,
        ];
    }
}
