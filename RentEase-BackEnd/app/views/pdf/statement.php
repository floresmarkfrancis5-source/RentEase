<?php defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
/** Billing statement (PDF). Variables: site_name, accent, bill (bill row), payments (paid payments for the bill) */
$h = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
$accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accent) ? $accent : '#0f766e';
$peso = function ($n) { return 'PHP ' . number_format((float) $n, 2); };
$colors = ['paid' => '#059669', 'unpaid' => '#b45309', 'overdue' => '#e11d48'];
?>
<html><head><meta charset="utf-8"><style>
  @page { margin: 36px 42px; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 12px; color: #0e1726; }
  .band { background: <?= $h($accent) ?>; color: #fff; padding: 18px 22px; }
  .band h1 { margin: 0; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; }
  td, th { padding: 9px 6px; border-bottom: 1px solid #dfe5f0; text-align: left; }
  th { color: #52607a; font-weight: normal; width: 34%; }
  .total { margin-top: 22px; padding: 16px 20px; background: #f1f5fb; text-align: right; font-size: 18px; font-weight: bold; }
  h3 { margin: 26px 0 0; font-size: 13px; }
  .status { font-weight: bold; color: <?= $colors[$bill['status']] ?? '#0e1726' ?>; text-transform: uppercase; }
  .foot { margin-top: 36px; color: #52607a; font-size: 10px; }
</style></head><body>
  <div class="band"><h1><?= $h($site_name) ?></h1>Billing Statement</div>
  <table>
    <tr><th>Statement for</th><td><strong><?= $h($bill['description']) ?></strong></td></tr>
    <tr><th>Tenant</th><td><?= $h($bill['tenant_name']) ?> (<?= $h($bill['tenant_email']) ?>)</td></tr>
    <tr><th>Property / Unit</th><td><?= $h($bill['property_name']) ?> - Unit <?= $h($bill['unit_name']) ?></td></tr>
    <tr><th>Billing period</th><td><?= $h(date('F Y', strtotime($bill['period_month'] . '-01'))) ?></td></tr>
    <tr><th>Due date</th><td><?= $h(date('F j, Y', strtotime($bill['due_date']))) ?></td></tr>
    <tr><th>Status</th><td class="status"><?= $h($bill['status']) ?></td></tr>
  </table>
  <div class="total">Amount: <?= $h($peso($bill['amount'])) ?></div>
  <?php if ($payments): ?>
    <h3>Payments received</h3>
    <table>
      <?php foreach ($payments as $x): ?>
        <tr><td><?= $h($x['receipt_no']) ?></td><td><?= $h(date('M j, Y', strtotime($x['paid_at']))) ?></td><td><?= $h(ucwords(str_replace('_', ' ', $x['method']))) ?></td><td style="text-align:right"><?= $h($peso($x['amount'])) ?></td></tr>
      <?php endforeach; ?>
    </table>
  <?php endif; ?>
  <p class="foot">Generated <?= $h(date('F j, Y g:i A')) ?> by <?= $h($site_name) ?>.</p>
</body></html>
