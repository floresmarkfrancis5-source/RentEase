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
        foreach (['User_model', 'Bill_model', 'Payment_model', 'Maintenance_model', 'Site_setting_model', 'Inapp_notification_model', 'Unit_transfer_model'] as $m) {
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

    public function welcome($user_id)
    {
        try {
            $u = $this->_lava->User_model->find_by_id($user_id);
            if (!$u) return;
            $site = $this->site();
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
            $this->_lava->mailer->send($u['id'], 'welcome', $u['id'], $u['email'], 'Your ' . $site['name'] . ' account', $html);
        } catch (Throwable $e) { /* logged by Mailer where relevant */ }
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
