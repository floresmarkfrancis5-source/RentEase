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
    public function send($user_id, $type, $related_id, $to, $subject, $html, array $attachments = [], $async = true)
    {
        $log = $this->_lava->Notification_model;

        if (!$this->configured()) {
            $log->log($user_id, $type, $related_id, $to, $subject, 'skipped', 'SMTP is not configured');
            return 'skipped';
        }

        // Asynchronous background dispatch (prevents Gmail SMTP network round-trips from freezing PHP)
        if ($async) {
            $is_windows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            if (!function_exists('exec')) {
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', 'Async email worker cannot be started in this runtime');
                return 'failed';
            }

            $queue_dir = ROOT_DIR . 'runtime' . DIRECTORY_SEPARATOR . 'mail_queue';
            if (!is_dir($queue_dir) && !@mkdir($queue_dir, 0700, true) && !is_dir($queue_dir)) {
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', 'Could not create the private email queue');
                return 'failed';
            }
            if (!is_writable($queue_dir)) {
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', 'The email queue is not writable');
                return 'failed';
            }
            @chmod($queue_dir, 0700);

            $job_data = [
                'user_id'     => $user_id,
                'type'        => $type,
                'related_id'  => $related_id,
                'to'          => $to,
                'subject'     => $subject,
                'html'        => $html,
                'attachments' => $attachments,
            ];

            $job_file = $queue_dir . DIRECTORY_SEPARATOR . 'mail_' . uniqid('', true) . '_' . mt_rand(1000, 9999) . '.json';
            $encoded_job = json_encode($job_data, JSON_UNESCAPED_UNICODE);
            if ($encoded_job === false || file_put_contents($job_file, $encoded_job, LOCK_EX) === false) {
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', 'Could not write the email job');
                return 'failed';
            }
            @chmod($job_file, 0600);

            $worker = ROOT_DIR . 'console' . DIRECTORY_SEPARATOR . 'mail_worker.php';
            if (!is_file($worker)) {
                @unlink($job_file);
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', 'Email worker script is missing');
                return 'failed';
            }

            try {
                if ($is_windows) {
                    $cmd = 'start "" /B ' . escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($job_file) . ' >NUL 2>&1';
                    exec($cmd, $output, $exit_code);
                    if ($exit_code !== 0) {
                        throw new RuntimeException('Could not launch the email worker');
                    }
                } else {
                    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($job_file) . ' > /dev/null 2>&1 &';
                    exec($cmd, $output, $exit_code);
                    if ($exit_code !== 0) {
                        throw new RuntimeException('Could not launch the email worker');
                    }
                }
            } catch (Throwable $e) {
                @unlink($job_file);
                $log->log($user_id, $type, $related_id, $to, $subject, 'failed', $e->getMessage());
                return 'failed';
            }

            $log->log($user_id, $type, $related_id, $to, $subject, 'sent');
            return 'sent';
        }

        // Synchronous fallback
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
            $m->Timeout = 5;
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
