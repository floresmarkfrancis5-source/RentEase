<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * TenantPortalController - everything a tenant can do (routes under /api/my, middleware: auth + tenant).
 * Every query is filtered by the logged-in tenant's id, so a tenant can never see someone else's data.
 */
class TenantPortalController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Bill_model', 'Payment_model', 'Lease_model', 'Maintenance_model', 'Maintenance_image_model', 'Inapp_notification_model', 'Site_setting_model', 'User_model']);
    }

    public function summary()
    {
        $this->api->require_method('GET');
        $this->Lease_model->sync_lifecycle();
        $uid     = $this->uid();
        $balance = $this->Bill_model->tenant_balance($uid);
        $this->ok(['data' => [
            'lease'    => $this->Lease_model->active_for_tenant($uid) ?: null,
            'upcoming_lease' => $this->Lease_model->scheduled_for_tenant($uid) ?: null,
            'contract_offers' => $this->Lease_model->offers_for_tenant($uid),
            'expired_contract_offers' => $this->Lease_model->expired_offers_for_tenant($uid),
            'balance'  => (float) $balance['balance'],
            'overdue'  => ['count' => (int) $balance['overdue_count'], 'amount' => (float) $balance['overdue_amount']],
            'next_due' => $this->Bill_model->next_due($uid) ?: null,
            'recent_payments' => array_slice($this->Payment_model->list_payments(['tenant_id' => $uid, 'status' => 'paid']), 0, 5),
        ]]);
    }

    public function accept_lease_offer($id)
    {
        $this->api->require_method('POST');
        $offer = $this->Lease_model->find_for_tenant($id, $this->uid());
        if (!$offer || $offer['status'] !== 'offered') {
            $this->fail('This contract is no longer available. Contact your landlord to request a new offer.', 409);
        }
        if (empty($this->input()['agree'])) {
            $this->fail('Confirm that you have read and agree to the contract.', 422, ['agree' => 'Agreement is required.']);
        }
        $result = $this->Lease_model->accept_offer($id, $this->uid());
        if ($result === 'expired') {
            $this->fail('This offer expired on its move-in date. Ask your landlord for a new contract with a new date.', 409);
        }
        if ($result === 'conflict') {
            $this->fail('This unit or your account already has an accepted move-in. Contact your landlord.', 409);
        }
        if ($result !== 'active' && $result !== 'scheduled') {
            $this->fail('This contract is no longer available. Contact your landlord to request a new offer.', 409);
        }
        $this->call->model('Inapp_notification_model');
        $this->Inapp_notification_model->notify_landlord(
            $offer['landlord_id'],
            'new_lease',
            'Lease contract accepted',
            $offer['tenant_name'] . ' accepted the lease for ' . $offer['unit_name'] . '.',
            $offer['id']
        );
        $this->ok(['message' => $result === 'active'
            ? 'Contract accepted. Your lease is now active.'
            : 'Contract accepted. Your lease will start on the move-in date.']);
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

        $tenant = $this->User_model->find_by_id($this->uid());
        $landlord_id = (int) ($tenant['landlord_id'] ?? 0);
        if ($landlord_id < 1) {
            $this->fail('Your landlord payment settings are not available.', 503);
        }
        $settings = $this->Site_setting_model->get_all($landlord_id);
        $methods = array_values(array_filter(array_map('trim', explode(',', $settings['payment_methods'] ?? ''))));
        if (!$methods) {
            $this->fail('Online payment is not available. Please contact your landlord.', 503);
        }

        $this->Payment_model->cancel_stale_pending($bill['id']);

        // Keep the test checkout amount small; the original bill remains unchanged.
        $chargeAmount = (config_item('paymongo_force_test_piso') && $this->paymongo->mode() === 'test')
            ? 1.00
            : (float) $bill['amount'];

        $pid = $this->Payment_model->create_pending($bill['id'], $bill['tenant_id'], $chargeAmount, 'paymongo');
        $checkoutBill = array_merge($bill, ['amount' => $chargeAmount]);
        try {
            $co = $this->paymongo->create_checkout(
                $checkoutBill, $pid,
                $frontend . '/tenant/bills?payment=' . $pid . '&result=success',
                $frontend . '/tenant/bills?payment=' . $pid . '&result=cancelled',
                $methods
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
        if (!empty($rows)) {
            $ids = array_column($rows, 'id');
            $imgs = $this->Maintenance_image_model->list_for_requests($ids);
            foreach ($rows as &$r) {
                $r['images'] = $imgs[$r['id']] ?? [];
            }
            unset($r);
        }
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function maintenance_store()
    {
        $this->api->require_method('POST');
        $lease = $this->Lease_model->active_for_tenant($this->uid());
        if (!$lease) {
            $this->fail('You need an active lease before you can send a repair request.', 409);
        }
        $in = $this->input();
        $d = $this->validate($in, [
            'category'    => ['type' => 'enum', 'required' => true, 'values' => [
                'Gas leak or fire damage',
                'Electrical (wiring, outlets, breaker)',
                'Plumbing (leaks, pipes, drains, toilet)',
                'Water supply (pump, tank, no water)',
                'Doors, windows, and locks',
                'Roof and ceiling',
                'Water heater or aircon (if provided)',
                'Pests and mold',
                'Walls, floors, and paint',
                'Other',
            ]],
            'title'       => ['type' => 'string', 'max' => 120, 'nullable' => true],
            'description' => ['type' => 'string', 'required' => true, 'min' => 5, 'max' => 2000],
            'priority'    => ['type' => 'enum', 'values' => ['low', 'medium', 'high'], 'nullable' => true],
        ]);
        if ($d['category'] === 'Other' && mb_strlen(trim($d['title'] ?? '')) < 3) {
            $this->fail('Describe the repair when selecting Other.', 422, ['title' => 'Enter at least 3 characters.']);
        }
        $fixedPriority = in_array($d['category'], [
            'Gas leak or fire damage',
            'Electrical (wiring, outlets, breaker)',
            'Plumbing (leaks, pipes, drains, toilet)',
            'Water supply (pump, tank, no water)',
        ], true) ? 'high' : (in_array($d['category'], [
            'Doors, windows, and locks',
            'Roof and ceiling',
            'Water heater or aircon (if provided)',
            'Pests and mold',
        ], true) ? 'medium' : 'low');
        if ($d['category'] === 'Other' && empty($d['priority'])) {
            $this->fail('Choose an urgency for this specific repair request.', 422, ['priority' => 'Choose Low, Medium, or Urgent.']);
        }
        $priority = $d['category'] === 'Other' ? $d['priority'] : $fixedPriority;
        $d['title'] = $d['category'] === 'Other' ? trim($d['title']) : $d['category'];
        $d['priority'] = $priority;
        $id = $this->Maintenance_model->create_request($d + ['tenant_id' => $this->uid(), 'unit_id' => $lease['unit_id']]);

        // Process attached images (e.g. pasted or selected photos)
        $raw_images = is_array($in['images'] ?? null) ? $in['images'] : [];
        $saved_images = [];
        $max_images = 10;
        $count = 0;
        foreach ($raw_images as $img) {
            if ($count >= $max_images) break;
            $data_url = is_array($img) ? ($img['data'] ?? null) : (is_string($img) ? $img : null);
            $file_name = is_array($img) ? ($img['name'] ?? null) : 'repair_photo.jpg';
            if (!$data_url) continue;

            [$binary, $mime, $err] = $this->Maintenance_image_model->decode_image($data_url);
            if ($binary && $mime && !$err) {
                $img_id = $this->Maintenance_image_model->create($id, $file_name, $mime, $binary, $this->uid(), 'tenant', $data_url);
                $saved_images[] = [
                    'id'         => $img_id,
                    'request_id' => $id,
                    'file_name'  => $file_name,
                    'mime'       => $mime,
                    'byte_size'  => strlen($binary),
                ];
                $count++;
            }
        }

        // 1. In-app notification to landlord
        $this->Inapp_notification_model->notify_landlord($lease['landlord_id'],
            'new_maintenance_request', 'New repair request',
            $lease['tenant_name'] . ' submitted a repair request for ' . $lease['unit_name'] . ($count > 0 ? " with {$count} photo(s)." : '.'),
            $id
        );

        // 2. Email notification to landlord
        $this->call->library('notifier');
        $this->notifier->new_maintenance_request($id);

        $row = $this->Maintenance_model->find($id);
        $row['images'] = $saved_images;

        $this->ok(['message' => 'Request sent to your landlord', 'data' => $row], 201);
    }

    public function maintenance_delete($id)
    {
        $this->api->require_method('DELETE');
        $deleted = $this->Maintenance_model->delete_request($id, $this->uid(), null);
        if (!$deleted) {
            $this->fail('Maintenance request not found or unauthorized.', 404);
        }
        $this->ok(['message' => 'Maintenance request cancelled and deleted.']);
    }
}
