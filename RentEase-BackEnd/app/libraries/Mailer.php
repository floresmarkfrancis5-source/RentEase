<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * Mailer - sends e-mail through any SMTP server with PHPMailer and records every attempt
 * in notifications_log. It never throws: a mail problem must not break a payment or a request.
 *
 * Settings are loaded from app/config/mailer.php (values are supplied through .env).
 * Without SMTP_HOST the mail is logged as "skipped".
 */
class Mailer
{
    private $_lava;

    public function __construct()
    {
        $this->_lava = lava_instance();
        $this->_lava->call->model('Notification_model');
    }

    public function configured()
    {
        return (string) config_item('mailer_smtp_host') !== '' && class_exists('PHPMailer\\PHPMailer\\PHPMailer');
    }

    /**
     * @param array $attachments  [['name' => 'receipt.pdf', 'data' => <binary>, 'type' => 'application/pdf'], ...]
     * @return string sent | failed | skipped
     */
    public function send($user_id, $type, $related_id, $to, $subject, $html, array $attachments = [])
    {
        $log = $this->_lava->Notification_model;

        if (!$this->configured()) {
            $log->log($user_id, $type, $related_id, $to, $subject, 'skipped', 'SMTP is not configured');
            return 'skipped';
        }

        try {
            $m = new PHPMailer\PHPMailer\PHPMailer(true);
            $m->isSMTP();
            $m->Host       = config_item('mailer_smtp_host');
            $m->Port       = (int) config_item('mailer_smtp_port');
            $secure        = (string) config_item('mailer_smtp_secure');
            $m->SMTPSecure = $secure === 'ssl' ? 'ssl' : ($secure === 'none' ? '' : 'tls');
            $m->SMTPAutoTLS = $secure !== 'none';
            if ((string) config_item('mailer_smtp_user') !== '') {
                $m->SMTPAuth = true;
                $m->Username = config_item('mailer_smtp_user');
                $m->Password = (string) config_item('mailer_smtp_pass');
            }
            $m->Timeout = 15;
            $m->CharSet = 'UTF-8';
            $m->setFrom(config_item('mailer_from'), config_item('mailer_from_name'));
            $m->addAddress($to);
            $m->Subject = $subject;
            $m->isHTML(true);
            $m->Body    = $html;
            $m->AltBody = trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>|<\/p>|<\/tr>/i', "\n", $html))));
            foreach ($attachments as $a) {
                $m->addStringAttachment($a['data'], $a['name'], 'base64', $a['type'] ?? 'application/octet-stream');
            }
            $m->send();
            $log->log($user_id, $type, $related_id, $to, $subject, 'sent');
            return 'sent';
        } catch (Throwable $e) {
            $log->log($user_id, $type, $related_id, $to, $subject, 'failed', $e->getMessage());
            return 'failed';
        }
    }
}
