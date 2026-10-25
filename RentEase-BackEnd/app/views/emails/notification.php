<?php defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
/** E-mail template (the "V" for notifications). Variables: site_name, accent, title, greeting, paragraphs[], rows[[label,value]], button_text, button_url */
$h = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
$accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accent) ? $accent : '#0f766e';
?>
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#eef2f9;font-family:Arial,Helvetica,sans-serif;color:#0e1726;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td style="background:<?= $h($accent) ?>;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold;"><?= $h($site_name) ?></td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 14px;font-size:22px;"><?= $h($title) ?></h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.55;"><?= $h($greeting) ?></p>
        <?php foreach ($paragraphs as $para): ?>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;"><?= $h($para) ?></p>
        <?php endforeach; ?>
        <?php if ($rows): ?>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border-top:1px solid #e5e9f2;">
            <?php foreach ($rows as $r): ?>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e9f2;color:#52607a;font-size:14px;width:40%;"><?= $h($r[0]) ?></td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e9f2;font-size:14px;font-weight:bold;"><?= $h($r[1]) ?></td>
              </tr>
            <?php endforeach; ?>
          </table>
        <?php endif; ?>
        <?php if ($button_text && $button_url): ?>
          <p style="margin:24px 0 0;"><a href="<?= $h($button_url) ?>" style="display:inline-block;background:<?= $h($accent) ?>;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px;"><?= $h($button_text) ?></a></p>
        <?php endif; ?>
      </td></tr>
      <tr><td style="padding:16px 28px;background:#f6f8fc;color:#52607a;font-size:12px;">This message was sent automatically by <?= $h($site_name) ?>.</td></tr>
    </table>
  </td></tr></table>
</body>
</html>
