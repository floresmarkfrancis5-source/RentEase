<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Landlord-scoped assistant queries and reviewed rental setup actions. */
class AssistantController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Assistant_conversation_model', 'Property_model', 'Unit_model']);
    }

    public function insights()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'action' => ['type' => 'enum', 'required' => true, 'values' => ['overdue', 'income', 'repairs']],
        ]);
        $owner_id = $this->uid();
        $date_row = $this->db->raw('SELECT CURRENT_DATE() AS as_of_date')->fetch(PDO::FETCH_ASSOC);
        $as_of_date = $date_row['as_of_date'] ?? null;

        if ($data['action'] === 'overdue') {
            $summary = $this->db->raw(
                "SELECT COUNT(*) AS count, COALESCE(SUM(b.amount), 0) AS amount
                   FROM bills b JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND b.status <> 'paid'
                    AND (b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE()))",
                [$owner_id]
            )->fetch(PDO::FETCH_ASSOC);
            $items = $this->db->raw(
                "SELECT b.amount, b.due_date, b.period_month, t.full_name AS tenant_name,
                        u.unit_name, p.name AS property_name,
                        DATEDIFF(CURDATE(), b.due_date) AS days_late
                   FROM bills b JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id
                   JOIN users t ON t.id = b.tenant_id
                  WHERE p.owner_id = ? AND b.status <> 'paid'
                    AND (b.status = 'overdue' OR (b.status = 'unpaid' AND b.due_date < CURDATE()))
                  ORDER BY b.due_date ASC, p.name, u.unit_name LIMIT 25",
                [$owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            $this->ok(['data' => [
                'action' => 'overdue',
                'as_of_date' => $as_of_date,
                'count' => (int) $summary['count'],
                'amount' => (float) $summary['amount'],
                'items' => $items,
            ]]);
        }

        if ($data['action'] === 'income') {
            $summary = $this->db->raw(
                "SELECT COUNT(l.id) AS active_leases,
                        COALESCE(SUM(l.monthly_rent), 0) AS monthly_income,
                        COALESCE(SUM(COALESCE(l.estimated_annual_income, l.monthly_rent * 12)), 0) AS annual_income
                   FROM leases l JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND l.status = 'active'",
                [$owner_id]
            )->fetch(PDO::FETCH_ASSOC);
            $this->ok(['data' => [
                'action' => 'income',
                'as_of_date' => $as_of_date,
                'active_leases' => (int) $summary['active_leases'],
                'monthly_income' => (float) $summary['monthly_income'],
                'annual_income' => (float) $summary['annual_income'],
            ]]);
        }

        $summary = $this->db->raw(
            "SELECT COUNT(*) AS count,
                    COALESCE(SUM(m.priority = 'high'), 0) AS high_priority
               FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id
              WHERE p.owner_id = ? AND m.status IN ('pending', 'in_progress')",
            [$owner_id]
        )->fetch(PDO::FETCH_ASSOC);
        $items = $this->db->raw(
            "SELECT m.id, m.title, m.description, m.priority, m.status, m.created_at,
                    t.full_name AS tenant_name, u.unit_name, p.name AS property_name
               FROM maintenance_requests m JOIN units u ON u.id = m.unit_id
               JOIN properties p ON p.id = u.property_id JOIN users t ON t.id = m.tenant_id
              WHERE p.owner_id = ? AND m.status IN ('pending', 'in_progress')
              ORDER BY FIELD(m.priority, 'high', 'medium', 'low'), m.created_at ASC LIMIT 25",
            [$owner_id]
        )->fetchAll(PDO::FETCH_ASSOC);
        $this->ok(['data' => [
            'action' => 'repairs',
            'as_of_date' => $as_of_date,
            'count' => (int) $summary['count'],
            'high_priority' => (int) $summary['high_priority'],
            'items' => $items,
        ]]);
    }

    public function add_units()
    {
        $this->api->require_method('POST');
        $in = $this->input();
        $property_id = $this->validate($in, [
            'property_id' => ['type' => 'int', 'required' => true, 'min' => 1],
        ])['property_id'];
        $this->not_found_unless($this->Property_model->find($property_id, $this->uid()), 'Property');

        $unit_inputs = $in['units'] ?? null;
        if (!is_array($unit_inputs) || count($unit_inputs) < 1 || count($unit_inputs) > 100) {
            $this->fail('Add between 1 and 100 units to continue.', 422, ['units' => 'At least one unit is required.']);
        }
        $units = [];
        $names = [];
        foreach ($unit_inputs as $index => $unit) {
            if (!is_array($unit)) {
                $this->fail('Check the unit details.', 422, ['units.' . $index => 'Invalid unit entry.']);
            }
            $clean = $this->validate($unit, [
                'unit_name' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 50],
                'monthly_rent' => ['type' => 'decimal', 'required' => true, 'min' => 0, 'max' => 99999999.99],
                'capacity' => ['type' => 'int', 'min' => 1, 'max' => 50, 'default' => 1],
                'condition_tag' => ['type' => 'enum', 'values' => ['good_condition', 'under_maintenance'], 'default' => 'good_condition'],
            ]);
            $key = mb_strtolower(trim($clean['unit_name']));
            if (isset($names[$key]) || $this->Unit_model->name_taken($property_id, $clean['unit_name'])) {
                $this->fail('A unit name is already in use for this property.', 409, ['units.' . $index . '.unit_name' => 'Choose a unique unit name.']);
            }
            $names[$key] = true;
            $clean['property_id'] = $property_id;
            $units[] = $clean;
        }

        $created = [];
        $this->db->transaction();
        try {
            foreach ($units as $unit) {
                $id = $this->Unit_model->create_unit($unit);
                $created[] = $this->Unit_model->find($id, $this->uid());
            }
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
        $this->ok(['message' => count($created) . ' unit(s) added.', 'data' => $created], 201);
    }

    public function conversations()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->Assistant_conversation_model->list_for_user($this->uid())]);
    }

    public function create_conversation()
    {
        $this->api->require_method('POST');
        $this->ok(['data' => $this->Assistant_conversation_model->create_for_user($this->uid())], 201);
    }

    public function show_conversation($id)
    {
        $this->api->require_method('GET');
        $conversation = $this->Assistant_conversation_model->get_for_user($id, $this->uid());
        $this->ok(['data' => $this->not_found_unless($conversation, 'Conversation')]);
    }

    public function delete_conversation($id)
    {
        $this->api->require_method('DELETE');
        if (!$this->Assistant_conversation_model->delete_for_user($id, $this->uid())) {
            $this->fail('Conversation not found.', 404);
        }
        $this->ok(['message' => 'Conversation deleted.']);
    }

    public function record_confirmation($id)
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'message' => ['type' => 'string', 'required' => true, 'max' => 500],
        ]);
        $saved = $this->Assistant_conversation_model->append_confirmation($id, $this->uid(), $data['message']);
        if (!$saved) {
            $this->fail('Conversation not found.', 404);
        }
        $this->ok(['message' => 'Confirmation saved.']);
    }

    public function chat()
    {
        $this->api->require_method('POST');
        $in = $this->input();
        $message = trim((string) ($in['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 4000) {
            $this->fail('Enter a message up to 4,000 characters.', 422, ['message' => 'Required; maximum 4,000 characters.']);
        }

        $history = $in['history'] ?? [];
        if (!is_array($history) || count($history) > 10) {
            $this->fail('Conversation history is invalid. Start a new chat.', 422, ['history' => 'Send no more than 10 prior messages.']);
        }
        $messages = [];
        foreach ($history as $index => $item) {
            if (!is_array($item) || !in_array($item['role'] ?? '', ['user', 'assistant'], true)
                || !is_string($item['content'] ?? null) || mb_strlen($item['content']) > 2000) {
                $this->fail('Conversation history is invalid. Start a new chat.', 422, ['history.' . $index => 'Invalid message.']);
            }
            $messages[] = ['role' => $item['role'], 'content' => $item['content']];
        }

        $conversation_id = null;
        if (array_key_exists('conversation_id', $in)) {
            if (!is_numeric($in['conversation_id']) || (int) $in['conversation_id'] < 1) {
                $this->fail('Conversation not found.', 404);
            }
            $conversation_id = (int) $in['conversation_id'];
        }
        $edit_message_id = null;
        if (array_key_exists('edit_message_id', $in)) {
            if (!is_numeric($in['edit_message_id']) || (int) $in['edit_message_id'] < 1 || $conversation_id === null) {
                $this->fail('The message cannot be edited.', 422);
            }
            $edit_message_id = (int) $in['edit_message_id'];
        }

        $turn = $this->Assistant_conversation_model->save_user_turn(
            $conversation_id,
            $this->uid(),
            $message,
            $messages,
            $edit_message_id
        );
        if (!$turn) {
            $this->fail('Conversation or message not found.', 404);
        }
        $messages = [['role' => 'user', 'content' => $message]];

        $this->call->library('gemini');
        $ownerId = $this->uid();
        $this->call->library('assistant_tools');
        $this->assistant_tools->set_context(
            $ownerId,
            $turn['conversation_id'],
            $turn['user_message_id'],
            $message,
            $this->Assistant_conversation_model
        );
        if (!$this->gemini->configured()) {
            $this->fail('The Assistant is not available right now. Please try again later.', 503);
        }
        try {
            $user = $this->user();
            $displayName = is_array($user)
                ? trim((string) ($user['full_name'] ?? $user['username'] ?? ''))
                : '';
            $displayName = mb_substr($displayName, 0, 100);
            $result = $this->gemini->rental_assistant(
                $messages,
                function ($toolName, array $arguments) {
                    return $this->assistant_tools->dispatch($toolName, $arguments);
                },
                $displayName,
                $this->assistant_tools->declarations()
            );
        } catch (Throwable $e) {
            $this->cancel_pending_actions_after_failure();
            error_log('RentEase Gemini assistant error: ' . $e->getMessage());
            $this->fail('The Assistant could not respond right now. Please try again later.', 502);
        }
        if (!empty($result['record_lookup'])) {
            $date_row = $this->db->raw('SELECT CURRENT_DATE() AS as_of_date')->fetch(PDO::FETCH_ASSOC);
            if (($result['proposal'] ?? null) === null) {
                $result['proposal'] = [
                    'kind' => 'database_answer',
                    'as_of_date' => $date_row['as_of_date'] ?? null,
                    'gemini_used' => true,
                ];
            }
        }
        if (!empty($result['suggestions'])) {
            if (!is_array($result['proposal'] ?? null)) {
                $result['proposal'] = ['kind' => 'assistant_response'];
            }
            $result['proposal']['suggestions'] = $result['suggestions'];
        }
        unset($result['suggestions']);
        try {
            $assistant_message_id = $this->Assistant_conversation_model->save_assistant_message(
                $turn['conversation_id'],
                $this->uid(),
                $result['reply'],
                $result['proposal']
            );
        } catch (Throwable $e) {
            $this->cancel_pending_actions_after_failure();
            error_log('RentEase assistant response could not be saved.');
            $this->fail('The Assistant response could not be saved. Please try again.', 500);
        }
        if (!$assistant_message_id) {
            $this->cancel_pending_actions_after_failure();
            $this->fail('Conversation not found.', 404);
        }
        $result['conversation_id'] = $turn['conversation_id'];
        $result['user_message_id'] = $turn['user_message_id'];
        $result['assistant_message_id'] = $assistant_message_id;
        $this->ok(['data' => $result]);
    }

    private function cancel_pending_actions_after_failure()
    {
        try {
            $this->assistant_tools->cancel_pending_for_current_turn();
        } catch (Throwable $e) {
            error_log('RentEase assistant pending-action cleanup failed: ' . $e->getMessage());
        }
    }

}
