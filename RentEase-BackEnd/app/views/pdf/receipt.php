<?php defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
/** Payment receipt (PDF). Variables: site_name, accent, p (payment row), bill (bill row) */
$h = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
$accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accent) ? $accent : '#0f766e';
$peso = function ($n) { return 'PHP ' . number_format((float) $n, 2); };
$paidAt = !empty($p['paid_at']) ? strtotime($p['paid_at']) : false;
$dueAt = !empty($bill['due_date']) ? strtotime($bill['due_date']) : false;
$periodAt = !empty($p['period_month']) ? strtotime($p['period_month'] . '-01') : false;
$lateFee = max(0, (float) ($bill['late_fee_amount'] ?? 0));
$rentAmount = max(0, (float) ($bill['amount'] ?? $p['amount']) - $lateFee);
$method = ucwords(str_replace('_', ' ', (string) ($p['method'] ?? '')));
?>
<html><head><meta charset="utf-8"><style>
  @page { margin: 38px 48px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 11px; line-height: 1.5; color: #172235; }
  .receipt { border: 1px solid #d8e0e8; }
  .header { padding: 22px 28px 20px; border-top: 5px solid <?= $h($accent) ?>; background: #172235; color: #fff; }
  .header-table, .meta, .items, .total-table { width: 100%; border-collapse: collapse; }
  .brand { font-size: 18px; font-weight: bold; }
  .document-type { text-align: right; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; }
  .receipt-label { margin-top: 3px; font-size: 9px; letter-spacing: 1.4px; text-transform: uppercase; opacity: .82; }
  .receipt-number { margin-top: 15px; font-size: 12px; font-weight: bold; }
  .paid { display: inline-block; padding: 4px 10px; border: 1px solid #bcebd7; border-radius: 3px; background: #e9f8f1; color: #087443; font-size: 9px; font-weight: bold; letter-spacing: 1px; }
  .content { padding: 24px 28px 26px; }
  .meta td { width: 50%; padding: 0 12px 16px 0; vertical-align: top; }
  .label { display: block; margin-bottom: 3px; color: #68778b; font-size: 8px; font-weight: bold; letter-spacing: .8px; text-transform: uppercase; }
  .value { font-size: 11px; font-weight: bold; }
  .section-title { margin: 8px 0 6px; color: #68778b; font-size: 8px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; }
  .items th { padding: 8px 10px; background: #f1f5f8; color: #526174; font-size: 8px; letter-spacing: .5px; text-align: left; text-transform: uppercase; }
  .items td { padding: 11px 10px; border-bottom: 1px solid #e3e8ee; }
  .items .amount { width: 30%; text-align: right; white-space: nowrap; }
  .total-wrap { margin-top: 14px; padding: 12px 14px; border: 1px solid #d8e0e8; background: #f8fafc; }
  .total-table td { vertical-align: middle; }
  .total-label { color: #526174; font-size: 10px; font-weight: bold; letter-spacing: .6px; text-transform: uppercase; }
  .total-amount { color: <?= $h($accent) ?>; font-size: 19px; font-weight: bold; text-align: right; white-space: nowrap; }
  .reference { margin-top: 18px; padding-top: 12px; border-top: 1px dashed #bfc9d4; color: #526174; font-size: 9px; }
  .reference strong { color: #172235; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e3e8ee; color: #68778b; font-size: 8px; text-align: center; }
</style></head><body>
  <div class="receipt">
    <div class="header">
      <table class="header-table"><tr>
        <td><div class="brand"><?= $h($site_name) ?></div><div class="receipt-label">Payment receipt</div></td>
        <td class="document-type">Payment receipt</td>
      </tr></table>
      <div class="receipt-number">Receipt no. <?= $h($p['receipt_no'] ?? '—') ?></div>
    </div>
    <div class="content">
      <table class="meta">
        <tr>
          <td><span class="label">Received from</span><span class="value"><?= $h($p['tenant_name'] ?? '—') ?></span></td>
          <td><span class="label">Payment status</span><span class="paid">PAID</span></td>
        </tr>
        <tr>
          <td><span class="label">Property / unit</span><span class="value"><?= $h($p['property_name'] ?? '—') ?> · <?= $h($p['unit_name'] ?? '—') ?></span></td>
          <td><span class="label">Date received</span><span class="value"><?= $paidAt ? $h(date('F j, Y · g:i A', $paidAt)) : '—' ?></span></td>
        </tr>
        <tr>
          <td><span class="label">Billing period</span><span class="value"><?= $periodAt ? $h(date('F Y', $periodAt)) : '—' ?></span></td>
          <td><span class="label">Due date</span><span class="value"><?= $dueAt ? $h(date('F j, Y', $dueAt)) : '—' ?></span></td>
        </tr>
      </table>

      <div class="section-title">Payment details</div>
      <table class="items">
        <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td><?= $h($p['bill_description'] ?? 'Rent payment') ?></td>
            <td class="amount"><?= $h($peso($rentAmount)) ?></td>
          </tr>
          <?php if ($lateFee > 0): ?>
            <tr><td>Late fee</td><td class="amount"><?= $h($peso($lateFee)) ?></td></tr>
          <?php endif; ?>
        </tbody>
      </table>

      <div class="total-wrap">
        <table class="total-table"><tr>
          <td class="total-label">Total amount received</td>
          <td class="total-amount"><?= $h($peso($p['amount'] ?? 0)) ?></td>
        </tr></table>
      </div>

      <div class="reference">
        Payment method: <strong><?= $h($method ?: '—') ?></strong>
        <?php if (!empty($p['paymongo_payment_ref'])): ?>
          <br>Transaction reference: <strong><?= $h($p['paymongo_payment_ref']) ?></strong>
        <?php endif; ?>
      </div>
      <div class="footer">This receipt confirms payment recorded by <?= $h($site_name) ?>. Keep it for your records.</div>
    </div>
  </div>
</body></html>
