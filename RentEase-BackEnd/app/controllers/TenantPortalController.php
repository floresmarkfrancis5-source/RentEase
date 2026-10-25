<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/**
 * TenantPortalController - everything a tenant can do (routes under /api/my, middleware: auth + tenant).
 * Every query is filtered by the logged-in tenant's id, so a tenant can never see someone else's data.
 */
class TenantPortalController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Bill_model', 'Payment_model', 'Lease_model', 'Maintenance_model', 'Inapp_notification_model']);
    }

    public function summary()
    {
        $this->api->require_method('GET');
        $uid     = $this->uid();
        $balance = $this->Bill_model->tenant_balance($uid);
        $this->ok(['data' => [
            'lease'    => $this->Lease_model->active_for_tenant($uid) ?: null,
            'balance'  => (float) $balance['balance'],
            'overdue'  => ['count' => (int) $balance['overdue_count'], 'amount' => (float) $balance['overdue_amount']],
            'next_due' => $this->Bill_model->next_due($uid) ?: null,
            'recent_payments' => array_slice($this->Payment_model->list_payments(['tenant_id' => $uid, 'status' => 'paid']), 0, 5),
        ]]);
    }

    public function bills()
    {
        $this->api->require_method('GET');
        $rows = $this->Bill_model->list_bills(['tenant_id' => $this->uid()]);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function payments()
    {
        $this->api->require_method('GET');
        $rows = $this->Payment_model->list_payments(['tenant_id' => $this->uid(), 'status' => 'paid']);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    /** POST /api/my/bills/{id}/pay -> { checkout_url }  (the browser then goes to PayMongo's hosted page) */
    public function pay($id)
    {
        $this->api->require_method('POST');
        $this->call->library('paymongo');
        $frontend = rtrim((string) config_item('notifier_frontend_url'), '/');
        if (!$this->paymongo->configured() || $frontend === '') {
            $this->fail('Online payment is not set up yet. Please pay your landlord directly.', 503);
        }

        $bill = $this->Bill_model->find($id);
        if (!$bill || (int) $bill['tenant_id'] !== $this->uid()) {
            $this->fail('Bill not found.', 404);
        }
        if ($bill['status'] === 'paid') {
            $this->fail('This bill is already paid.', 409);
        }

        $this->Payment_model->cancel_stale_pending($bill['id']);
        $pid = $this->Payment_model->create_pending($bill['id'], $bill['tenant_id'], $bill['amount'], 'paymongo');
        try {
            $co = $this->paymongo->create_checkout(
                $bill, $pid,
                $frontend . '/tenant/bills?payment=' . $pid . '&result=success',
                $frontend . '/tenant/bills?payment=' . $pid . '&result=cancelled'
            );
            $this->Payment_model->set_checkout($pid, $co['id']);
        } catch (Throwable $e) {
            $this->Payment_model->mark_failed($pid);
            $this->fail('The payment page could not be opened: ' . $e->getMessage(), 502);
        }
        $this->ok(['message' => 'Redirecting to PayMongo', 'payment_id' => $pid, 'checkout_url' => $co['checkout_url']]);
    }

    /**
     * POST /api/my/payments/{id}/verify
     * Called when the tenant returns from PayMongo. If the webhook has not arrived yet we ask PayMongo
     * directly, so the bill is marked paid either way. Settling is idempotent.
     */
    public function verify($id)
    {
        $this->api->require_method('POST');
        $p = $this->Payment_model->find($id);
        if (!$p || (int) $p['tenant_id'] !== $this->uid()) {
            $this->fail('Payment not found.', 404);
        }

        if ($p['status'] === 'pending' && $p['paymongo_checkout_id']) {
            $this->call->library('paymongo');
            try {
                $r = $this->paymongo->get_checkout($p['paymongo_checkout_id']);
                if ($r['paid'] && (int) $r['amount'] === (int) round(((float) $p['amount']) * 100)) {
                    if ($this->Payment_model->settle($p['id'], $r['payment_id'])) {
                        $this->call->library('notifier');
                        $this->notifier->payment_confirmation($p['id']);
                    }
                }
            } catch (Throwable $e) { /* leave it pending; the webhook may still arrive */ }
            $p = $this->Payment_model->find($id);
        }
        $this->ok(['data' => ['id' => (int) $p['id'], 'status' => $p['status'], 'receipt_no' => $p['receipt_no']]]);
    }

    public function maintenance_index()
    {
        $this->api->require_method('GET');
        $rows = $this->Maintenance_model->list_requests(['tenant_id' => $this->uid()]);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function maintenance_store()
    {
        $this->api->require_method('POST');
        $lease = $this->Lease_model->active_for_tenant($this->uid());
        if (!$lease) {
            $this->fail('You need an active lease before you can send a repair request.', 409);
        }
        $d = $this->validate($this->input(), [
            'title'       => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 120],
            'description' => ['type' => 'string', 'required' => true, 'min' => 5, 'max' => 2000],
            'priority'    => ['type' => 'enum', 'values' => ['low', 'medium', 'high'], 'default' => 'medium'],
        ]);
        $id = $this->Maintenance_model->create_request($d + ['tenant_id' => $this->uid(), 'unit_id' => $lease['unit_id']]);
        $this->Inapp_notification_model->notify_landlord($lease['landlord_id'],
            'new_maintenance_request', 'New repair request',
            $lease['tenant_name'] . ' submitted a repair request for ' . $lease['unit_name'] . '.',
            $id
        );
        $this->ok(['message' => 'Request sent to your landlord', 'data' => $this->Maintenance_model->find($id)], 201);
    }
}
