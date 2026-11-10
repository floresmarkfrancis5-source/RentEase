<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/**
 * BaseApiController - shared helpers for every RentEase API controller (not routed itself).
 */
class BaseApiController extends Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->call->database();
        $this->call->library('api');
    }

    /** Api::body() HTML-encodes strings; React already escapes output, so decode here. */
    protected function input()
    {
        $body = $this->api->body();
        array_walk_recursive($body, function (&$v) {
            if (is_string($v)) {
                $v = html_entity_decode($v, ENT_QUOTES, 'UTF-8');
            }
        });
        return $body;
    }

    protected function ok($data = [], $code = 200)
    {
        $this->api->respond($data, $code);
    }

    protected function fail($message, $code = 400, $errors = null)
    {
        if ($errors) {
            $this->api->respond(['error' => $message, 'errors' => $errors, 'status' => $code], $code);
        }
        $this->api->respond_error($message, $code);
    }

    protected function not_found_unless($row, $what = 'Record')
    {
        if (!$row) {
            $this->fail($what . ' not found.', 404);
        }
        return $row;
    }

    protected function contract_template($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_string($value)) {
            $value = json_decode($value, true);
        }
        if (!is_array($value) || !is_array($value['clauses'] ?? null) || count($value['clauses']) > 16) {
            $this->fail('Check the lease contract clauses.', 422, ['contract_template' => 'Invalid contract template.']);
        }

        $clauses = [];
        foreach ($value['clauses'] as $index => $clause) {
            if (!is_array($clause)) {
                $this->fail('Check the lease contract clauses.', 422, ['contract_template' => 'Each clause needs a title and wording.']);
            }
            $title = trim((string) ($clause['title'] ?? ''));
            $text = trim((string) ($clause['text'] ?? ''));
            if ($title === '' || mb_strlen($title) > 100 || $text === '' || mb_strlen($text) > 3000) {
                $this->fail('Check the lease contract clauses.', 422, [
                    'contract_template' => 'Each clause needs a title (up to 100 characters) and wording (up to 3,000 characters).',
                ]);
            }
            $clauses[] = [
                'id' => preg_replace('/[^a-z0-9_-]/', '', strtolower((string) ($clause['id'] ?? ('clause-' . $index)))),
                'title' => $title,
                'text' => $text,
                'enabled' => !empty($clause['enabled']),
            ];
        }

        $rules = [];
        foreach (($value['rules'] ?? []) as $rule) {
            if (!is_string($rule)) {
                continue;
            }
            $rule = trim($rule);
            if ($rule !== '' && mb_strlen($rule) <= 500 && count($rules) < 30) {
                $rules[] = $rule;
            }
        }

        $utilities = [];
        foreach (['electricity', 'water', 'internet'] as $utility) {
            $responsibility = $value['utilities'][$utility] ?? 'Tenant';
            $utilities[$utility] = in_array($responsibility, ['Tenant', 'Landlord', 'Shared'], true) ? $responsibility : 'Tenant';
        }
        $notice_rules = [
            'entry_hours' => [0, 168],
            'termination_days' => [0, 365],
            'unpaid_months' => [0, 24],
            'refund_days' => [0, 365],
            'grace_days' => [0, 31],
            'late_fee' => [0, 99999999.99],
        ];
        $notices = [];
        foreach ($notice_rules as $key => [$min, $max]) {
            $number = $value['notices'][$key] ?? 0;
            if (!is_numeric($number) || $number < $min || $number > $max) {
                $this->fail('Check the contract notice and payment settings.', 422, [
                    'contract_template' => 'Notice periods, grace days, and late fees must be within their allowed ranges.',
                ]);
            }
            $notices[$key] = $key === 'late_fee' ? round((float) $number, 2) : (int) $number;
        }

        return json_encode([
            'enabled' => !empty($value['enabled']),
            'clauses' => $clauses,
            'rules' => $rules,
            'utilities' => $utilities,
            'notices' => $notices,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    protected function uid()   { return Req_context::user_id(); }
    protected function admin() { return Req_context::is_admin(); }
    protected function user()  { return Req_context::user(); }
    protected function role()  { return Req_context::role(); }

    /**
     * Mini validator.  $rules = ['field' => ['type' => 'string|email|int|decimal|date|enum|bool', ...]]
     * options: required, nullable, min, max, values (enum), default (when missing & not partial)
     * $partial = true  -> only validate keys that were actually sent (PATCH).
     * Responds 422 with per-field messages; returns the cleaned values.
     */
    protected function validate(array $in, array $rules, $partial = false)
    {
        $clean  = [];
        $errors = [];

        foreach ($rules as $field => $r) {
            $present = array_key_exists($field, $in);
            if (!$present) {
                if ($partial) {
                    continue;
                }
                if (array_key_exists('default', $r)) {
                    $clean[$field] = $r['default'];
                    continue;
                }
            }
            $raw = $present ? $in[$field] : null;
            if (is_array($raw)) {
                $errors[$field] = 'Invalid value.';
                continue;
            }
            $val = is_string($raw) ? trim($raw) : $raw;
            $empty = ($val === null || $val === '');

            if ($empty) {
                if (!empty($r['required'])) {
                    $errors[$field] = 'This field is required.';
                } elseif (!empty($r['nullable']) || ($r['type'] ?? '') === 'string') {
                    $clean[$field] = ($r['type'] ?? '') === 'string' && empty($r['nullable']) ? '' : null;
                } elseif (array_key_exists('default', $r)) {
                    $clean[$field] = $r['default'];
                } else {
                    $errors[$field] = 'This field is required.';
                }
                continue;
            }

            switch ($r['type']) {
                case 'string':
                    $len = mb_strlen((string) $val);
                    if (isset($r['min']) && $len < $r['min']) { $errors[$field] = "At least {$r['min']} characters."; break; }
                    if (isset($r['max']) && $len > $r['max']) { $errors[$field] = "At most {$r['max']} characters."; break; }
                    $clean[$field] = (string) $val;
                    break;
                case 'email':
                    $val = strtolower((string) $val);
                    if (!filter_var($val, FILTER_VALIDATE_EMAIL) || strlen($val) > 255) { $errors[$field] = 'Enter a valid email address.'; break; }
                    $clean[$field] = $val;
                    break;
                case 'int':
                    if (!is_numeric($val) || (int) $val != $val) { $errors[$field] = 'Must be a whole number.'; break; }
                    if ((isset($r['min']) && $val < $r['min']) || (isset($r['max']) && $val > $r['max'])) {
                        $errors[$field] = 'Must be between ' . ($r['min'] ?? '-∞') . ' and ' . ($r['max'] ?? '∞') . '.'; break;
                    }
                    $clean[$field] = (int) $val;
                    break;
                case 'decimal':
                    if (!is_numeric($val)) { $errors[$field] = 'Must be a number.'; break; }
                    if ((isset($r['min']) && $val < $r['min']) || (isset($r['max']) && $val > $r['max'])) {
                        $errors[$field] = 'Must be between ' . ($r['min'] ?? '-∞') . ' and ' . ($r['max'] ?? '∞') . '.'; break;
                    }
                    $clean[$field] = round((float) $val, $r['scale'] ?? 2);
                    break;
                case 'date':
                    $d = DateTime::createFromFormat('Y-m-d', (string) $val);
                    if (!$d || $d->format('Y-m-d') !== $val) { $errors[$field] = 'Use the format YYYY-MM-DD.'; break; }
                    $clean[$field] = $val;
                    break;
                case 'enum':
                    if (!in_array($val, $r['values'], true)) { $errors[$field] = 'Must be one of: ' . implode(', ', $r['values']) . '.'; break; }
                    $clean[$field] = $val;
                    break;
                case 'bool':
                    $clean[$field] = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
                    break;
                default:
                    $errors[$field] = 'Unsupported rule.';
            }
        }

        if ($errors) {
            $this->fail('Validation failed', 422, $errors);
        }
        if ($partial && !$clean) {
            $this->fail('Nothing to update.', 422);
        }
        return $clean;
    }

    protected function strong_password($password)
    {
        return strlen($password) >= 8 && preg_match('/[A-Za-z]/', $password) && preg_match('/\d/', $password);
    }
}
