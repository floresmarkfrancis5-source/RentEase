<?php
/**
 * Asynchronous Background Mail Worker
 * Dispatches an email job in a detached CLI process to prevent web requests from stalling.
 */
if (PHP_SAPI !== 'cli') {
    die('CLI only');
}

$job_file = $argv[1] ?? '';
if (!$job_file || !is_file($job_file)) {
    exit(0);
}

$raw = file_get_contents($job_file);
@unlink($job_file);

$job = json_decode($raw, true);
if (!$job || empty($job['to']) || empty($job['subject'])) {
    exit(0);
}

$root = dirname(__DIR__) . DIRECTORY_SEPARATOR;
require_once $root . 'vendor/autoload.php';

// Parse .env if environment variables are not already loaded
if (!getenv('SMTP_HOST') && is_file($root . '.env')) {
    $lines = file($root . '.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) continue;
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        $v = trim($v, " \t\n\r\0\x0B\"'");
        if (!getenv($k)) putenv("{$k}={$v}");
    }
}

$smtp_host   = $job['smtp']['host']   ?? getenv('SMTP_HOST') ?: '';
$smtp_port   = (int) ($job['smtp']['port']   ?? getenv('SMTP_PORT') ?: 465);
$smtp_user   = $job['smtp']['user']   ?? getenv('SMTP_USER') ?: '';
$smtp_pass   = $job['smtp']['pass']   ?? getenv('SMTP_PASS') ?: '';
$smtp_secure = strtolower($job['smtp']['secure'] ?? getenv('SMTP_SECURE') ?: 'ssl');
$from_email  = $job['smtp']['from']   ?? getenv('MAIL_FROM') ?: 'no-reply@rentease.local';
$from_name   = $job['smtp']['from_name'] ?? getenv('MAIL_FROM_NAME') ?: 'RentEase';

if ($smtp_host === '') {
    exit(0);
}

$status = 'failed';
$error  = null;

try {
    $m = new PHPMailer\PHPMailer\PHPMailer(true);
    $m->isSMTP();
    $m->Host       = $smtp_host;
    $m->Port       = $smtp_port;
    $m->SMTPSecure = $smtp_secure === 'ssl' ? 'ssl' : ($smtp_secure === 'none' ? '' : 'tls');
    $m->SMTPAutoTLS = $smtp_secure !== 'none';
    if ($smtp_user !== '') {
        $m->SMTPAuth = true;
        $m->Username = $smtp_user;
        $m->Password = $smtp_pass;
    }
    $m->Timeout = 8;
    $m->CharSet = 'UTF-8';
    $m->setFrom($from_email, $from_name);
    $m->addAddress($job['to']);
    $m->Subject = $job['subject'];
    $m->isHTML(true);
    $m->Body    = $job['html'];
    $m->AltBody = trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>|<\/p>|<\/tr>/i', "\n", $job['html']))));

    if (!empty($job['attachments'])) {
        foreach ($job['attachments'] as $a) {
            $m->addStringAttachment($a['data'], $a['name'], 'base64', $a['type'] ?? 'application/octet-stream');
        }
    }

    $m->send();
    $status = 'sent';
} catch (Throwable $e) {
    $status = 'failed';
    $error  = $e->getMessage();
}

exit($status === 'sent' ? 0 : 1);
