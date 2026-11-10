<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Notifier - builds and sends the four kinds of RentEase e-mail:
 * welcome, due-date reminder, payment confirmation (with PDF receipt) and maintenance update.
 * The HTML comes from app/views/emails/notification.php. Every method is safe to call: it never throws.
 */
class Notifier
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
        $this->_lava->call->library('mailer');
        $this->_lava->call->library('pdf');
        foreach (['User_model', 'Bill_model', 'Payment_model', 'Maintenance_model', 'Maintenance_image_model', 'Site_setting_model', 'Inapp_notification_model', 'Unit_transfer_model'] as $m) {
            $this->_lava->call->model($m);
        }
    }

    private function site()
    {
        $s = $this->_lava->Site_setting_model->get_all();
        return ['name' => $s['site_name'], 'accent' => $s['accent_color']];
    }

    private function frontend($path = '')
    {
        $base = rtrim((string) config_item('notifier_frontend_url'), '/');
        return $base === '' ? '' : $base . $path;
    }

    private function render(array $d)
    {
        $site = $this->site();
        $d += ['site_name' => $site['name'], 'accent' => $site['accent'], 'rows' => [], 'paragraphs' => [], 'button_text' => null, 'button_url' => null];
        return $this->_lava->pdf->html('emails/notification', $d);
    }

    private function peso($n)
    {
        return '₱' . number_format((float) $n, 2);
    }

    public function welcome($user_id, $raw_token = null, $unit_name = null)
    {
        try {
            $u = $this->_lava->User_model->find_by_id($user_id);
            if (!$u) return 'failed';
            $site = $this->site();

            if ($raw_token) {
                $activate_url = $this->frontend('/activate?token=' . rawurlencode($raw_token));
                $html = $this->render([
                    'title'       => 'Activate your tenant account',
                    'greeting'    => 'Hi ' . ($u['full_name'] ?: $u['username']) . ',',
                    'paragraphs'  => [
                        'Your landlord created a ' . $site['name'] . ' tenant account for you' . ($unit_name ? ' for ' . $unit_name : '') . '. You can view your balance, pay rent, download billing statements and report repairs online.',
                        'Please verify your email address and create your password by clicking the button below. This activation link is valid for 7 days.',
                        'You can also activate and link your Google Account directly on the activation page.',
                    ],
                    'button_text' => 'Activate Account & Set Password',
                    'button_url'  => $activate_url,
                ]);
                $subject = 'Activate your ' . $site['name'] . ' account' . ($unit_name ? ' (' . $unit_name . ')' : '');
            } else {
                $html = $this->render([
                    'title'      => 'Welcome to ' . $site['name'],
                    'greeting'   => 'Hi ' . ($u['full_name'] ?: $u['username']) . ',',
                    'paragraphs' => [
                        'Your landlord created a ' . $site['name'] . ' account for you. You can see your balance, pay rent online, download receipts and report repairs.',
                        'Sign in with this email address (' . $u['email'] . ') using the temporary password your landlord gave you, or with Google. You will be asked to choose a new password.',
                    ],
                    'button_text' => 'Open ' . $site['name'],
                    'button_url'  => $this->frontend('/login'),
                ]);
                $subject = 'Your ' . $site['name'] . ' account';
            }

            return $this->_lava->mailer->send($u['id'], 'welcome', $u['id'], $u['email'], $subject, $html);
        } catch (Throwable $e) {
            error_log('RentEase welcome notification failed for user id ' . (int) $user_id . ': ' . $e->getMessage());
            return 'failed';
        }
    }

    public function due_reminder($bill_id)
    {
        try {
            $b = $this->_lava->Bill_model->find($bill_id);
            if (!$b || $b['status'] === 'paid') return 'skipped';
            $late = $b['status'] === 'overdue';
            $this->_lava->Inapp_notification_model->create(
                $b['tenant_id'], 'due_reminder', $late ? 'Rent payment overdue' : 'Rent due soon',
                $b['description'] . ' is ' . ($late ? 'overdue' : 'due on ' . date('M j', strtotime($b['due_date']))) . '.',
                $b['id']
            );
            $html = $this->render([
                'title'    => $late ? 'Your rent is overdue' : 'Your rent is due soon',
                'greeting' => 'Hi ' . $b['tenant_name'] . ',',
                'paragraphs' => [$late
                    ? 'This is a reminder that the bill below is past its due date. Please pay as soon as you can.'
                    : 'This is a friendly reminder that the bill below is coming due.'],
                'rows' => [
                    ['Bill', $b['description']],
                    ['Property / Unit', $b['property_name'] . ' - ' . $b['unit_name']],
                    ['Amount', $this->peso($b['amount'])],
                    ['Due date', date('F j, Y', strtotime($b['due_date']))],
                ],
                'button_text' => 'Pay now',
                'button_url'  => $this->frontend('/tenant/bills'),
            ]);
            return $this->_lava->mailer->send($b['tenant_id'], 'due_reminder', $b['id'], $b['tenant_email'],
                ($late ? 'Overdue: ' : 'Due soon: ') . $b['description'], $html);
        } catch (Throwable $e) { return 'failed'; }
    }

    public function payment_confirmation($payment_id)
    {
        try {
            $p = $this->_lava->Payment_model->find($payment_id);
            if (!$p || $p['status'] !== 'paid') return;
            $t = $this->_lava->User_model->find_by_id($p['tenant_id']);
            $this->_lava->Inapp_notification_model->create(
                $p['tenant_id'], 'payment_confirmation', 'Payment received',
                'Your payment of ' . $this->peso($p['amount']) . ' was received.',
                $p['id']
            );
            $this->_lava->Inapp_notification_model->notify_landlord($t['landlord_id'] ?? null,
                'payment_received', 'Payment received',
                $p['tenant_name'] . ' paid ' . $this->peso($p['amount']) . '.',
                $p['id']
            );

            $attachments = [];
            try {
                $attachments[] = ['name' => $p['receipt_no'] . '.pdf', 'type' => 'application/pdf',
                                  'data' => $this->_lava->pdf->render('pdf/receipt', $this->receipt_data($p))];
            } catch (Throwable $e) { /* e-mail still goes out without the attachment */ }

            $html = $this->render([
                'title'    => 'Payment received - thank you!',
                'greeting' => 'Hi ' . $t['full_name'] . ',',
                'paragraphs' => ['We received your payment. Your official receipt is attached to this email.'],
                'rows' => [
                    ['Receipt no.', $p['receipt_no']],
                    ['For', $p['bill_description']],
                    ['Amount paid', $this->peso($p['amount'])],
                    ['Paid on', date('F j, Y g:i A', strtotime($p['paid_at']))],
                    ['Method', ucwords(str_replace('_', ' ', $p['method']))],
                ],
            ]);
            $this->_lava->mailer->send($t['id'], 'payment_confirmation', $p['id'], $t['email'], 'Payment received - ' . $p['receipt_no'], $html, $attachments);
        } catch (Throwable $e) { /* never break a payment */ }
    }

    public function maintenance_update($request_id)
    {
        try {
            $m = $this->_lava->Maintenance_model->find($request_id);
            if (!$m) return;
            $labels = ['pending' => 'Pending', 'in_progress' => 'In progress', 'resolved' => 'Resolved'];
            $rows = [['Request', $m['title']], ['Unit', $m['property_name'] . ' - ' . $m['unit_name']], ['Status', $labels[$m['status']] ?? $m['status']]];
            $this->_lava->Inapp_notification_model->create(
                $m['tenant_id'], 'maintenance_update', 'Repair request updated',
                $m['title'] . ' is now ' . str_replace('_', ' ', $m['status']) . '.',
                $m['id']
            );
            if (!empty($m['admin_notes'])) $rows[] = ['Note from landlord', $m['admin_notes']];
            $html = $this->render([
                'title'      => 'Update on your repair request',
                'greeting'   => 'Hi ' . $m['tenant_name'] . ',',
                'paragraphs' => ['Your landlord updated the status of your maintenance request.'],
                'rows'       => $rows,
                'button_text' => 'View requests',
                'button_url'  => $this->frontend('/tenant/maintenance'),
            ]);
            $this->_lava->mailer->send($m['tenant_id'], 'maintenance_update', $m['id'], $m['tenant_email'], 'Repair request update: ' . $m['title'], $html);
        } catch (Throwable $e) { /* ignore */ }
    }

    public function new_maintenance_request($request_id)
    {
        try {
            $m = $this->_lava->Maintenance_model->find($request_id);
            if (!$m || empty($m['landlord_id'])) return;

            $landlord = $this->_lava->User_model->find_by_id($m['landlord_id']);
            if (!$landlord || empty($landlord['email'])) return;

            $images = [];
            if (isset($this->_lava->Maintenance_image_model)) {
                $images = $this->_lava->Maintenance_image_model->list_for_request($request_id);
            }
            $img_count = count($images);

            $priority_labels = ['low' => 'Low', 'medium' => 'Medium', 'high' => 'Urgent / High'];
            $priority_label = $priority_labels[$m['priority']] ?? ucfirst($m['priority']);

            $paragraphs = [
                'A new repair request has been submitted by ' . ($m['tenant_name'] ?: 'your tenant') . ' for ' . $m['unit_name'] . ' at ' . $m['property_name'] . '.',
                'Issue description: "' . $m['description'] . '"',
            ];
            if ($img_count > 0) {
                $paragraphs[] = '📸 ' . $img_count . ' photo' . ($img_count > 1 ? 's' : '') . ' attached with the repair request. You can inspect photos and manage repairs in your landlord dashboard.';
            }

            $rows = [
                ['Issue', $m['title']],
                ['Property & Unit', $m['property_name'] . ' - ' . $m['unit_name']],
                ['Tenant', ($m['tenant_name'] ?: 'Tenant') . ' (' . $m['tenant_email'] . ')'],
                ['Priority', $priority_label],
                ['Photos attached', $img_count > 0 ? $img_count . ' photo' . ($img_count > 1 ? 's' : '') : 'None'],
                ['Submitted at', date('F j, Y g:i A', strtotime($m['created_at'] ?? 'now'))],
            ];

            $html = $this->render([
                'title'       => 'New Repair Request: ' . $m['title'],
                'greeting'    => 'Hi ' . ($landlord['full_name'] ?: $landlord['username']) . ',',
                'paragraphs'  => $paragraphs,
                'rows'        => $rows,
                'button_text' => 'Review Request in Dashboard',
                'button_url'  => $this->frontend('/admin/maintenance'),
            ]);

            $subject = 'New Repair Request: ' . $m['title'] . ' (' . $m['unit_name'] . ')';
            $this->_lava->mailer->send($landlord['id'], 'new_maintenance_request', $m['id'], $landlord['email'], $subject, $html);
        } catch (Throwable $e) { /* email failure should never break request creation */ }
    }

    public function transfer_result($request_id)
    {
        try {
            $r = $this->_lava->Unit_transfer_model->find($request_id);
            if (!$r) return;
            $approved = $r['status'] === 'approved';
            $this->_lava->Inapp_notification_model->create(
                $r['tenant_id'],
                'transfer_result',
                $approved ? 'Transfer approved' : 'Transfer request declined',
                $approved
                    ? 'Your transfer to ' . $r['requested_unit_name'] . ' was approved.'
                    : 'Your unit transfer request was declined.' . (!empty($r['admin_note']) ? ' Note: ' . $r['admin_note'] : ''),
                $r['id']
            );
        } catch (Throwable $e) { /* logged by the API request where relevant */ }
    }

    public function tenant_unit_reassigned($tenant_id, $old_unit_label, $new_unit_label, $new_rent, $notes = null)
    {
        try {
            $u = $this->_lava->User_model->find_by_id($tenant_id);
            if (!$u) return;

            $this->_lava->Inapp_notification_model->create(
                $tenant_id,
                'unit_reassigned',
                'Your unit has been reassigned',
                "Your landlord moved you from {$old_unit_label} to {$new_unit_label}." . ($notes ? ' Note: ' . $notes : ''),
                null
            );

            $paragraphs = [
                "Your landlord has moved your room/unit to {$new_unit_label}.",
                "Previous Unit: {$old_unit_label}",
                "New Monthly Rent: " . $this->peso($new_rent),
            ];
            if ($notes) {
                $paragraphs[] = "Landlord Note: \"{$notes}\"";
            }
            $paragraphs[] = "Please review your updated lease in your tenant portal.";

            $html = $this->render([
                'title'       => 'Notice of Unit Reassignment',
                'greeting'    => 'Hi ' . ($u['full_name'] ?: $u['username']) . ',',
                'paragraphs'  => $paragraphs,
                'button_text' => 'View My Rent & Lease',
                'button_url'  => $this->frontend('/tenant/transfers'),
            ]);

            $this->_lava->mailer->send($tenant_id, 'unit_reassigned', null, $u['email'], 'Notice of Unit Reassignment - RentEase', $html);
        } catch (Throwable $e) { /* notification error should not break operation */ }
    }

    /** Data used by the receipt view (shared with the PDF download endpoint). */
    public function receipt_data(array $p)
    {
        $bill = $this->_lava->Bill_model->find($p['bill_id']);
        $site = $this->_lava->Site_setting_model->get_all();
        return ['site_name' => $site['site_name'], 'accent' => $site['accent_color'], 'p' => $p, 'bill' => $bill];
    }

    public function statement_data(array $bill)
    {
        $site = $this->_lava->Site_setting_model->get_all();
        $pays = $this->_lava->Payment_model->list_payments(['tenant_id' => $bill['tenant_id']]);
        $pays = array_values(array_filter($pays, function ($x) use ($bill) { return (int) $x['bill_id'] === (int) $bill['id'] && $x['status'] === 'paid'; }));
        return ['site_name' => $site['site_name'], 'accent' => $site['accent_color'], 'bill' => $bill, 'payments' => $pays];
    }
}
