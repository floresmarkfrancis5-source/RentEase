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
        $messages = array_merge($turn['history'], [['role' => 'user', 'content' => $message]]);

        $this->call->library('gemini');
        $isContractRequest = (bool) preg_match('/\b(contract|agreement|clause|house rules?)\b/i', $message);
        $isPropertySetupFollowUp = $this->is_property_setup_follow_up($turn['history']);
        $localReply = ($isContractRequest || $isPropertySetupFollowUp)
            ? null
            : $this->answer_database_question($message, $this->uid());
        if ($localReply !== null) {
            $result = ['reply' => $localReply, 'proposal' => ['kind' => 'database_answer']];
        } elseif ($isContractRequest && $this->gemini->configured()) {
            try {
                $result = $this->gemini->draft_contract($message);
            } catch (RuntimeException $e) {
                error_log('RentEase Gemini contract draft error: ' . $e->getMessage());
                $this->fail('The contract draft could not be prepared right now. Please try again later.', 502);
            }
        } elseif (!$this->gemini->configured()) {
            $this->fail('The Assistant is not available right now. Please try again later.', 503);
        } else {
            try {
                $result = $this->gemini->rental_assistant($messages);
            } catch (RuntimeException $e) {
                error_log('RentEase Gemini assistant error: ' . $e->getMessage());
                $this->fail('The Assistant could not respond right now. Please try again later.', 502);
            }
        }
        $assistant_message_id = $this->Assistant_conversation_model->save_assistant_message(
            $turn['conversation_id'],
            $this->uid(),
            $result['reply'],
            $result['proposal']
        );
        if (!$assistant_message_id) {
            $this->fail('Conversation not found.', 404);
        }
        $result['conversation_id'] = $turn['conversation_id'];
        $result['user_message_id'] = $turn['user_message_id'];
        $result['assistant_message_id'] = $assistant_message_id;
        $this->ok(['data' => $result]);
    }

    private function answer_database_question($message, $owner_id)
    {
        $question = mb_strtolower($message);
        $limit = 101;

        if (preg_match('/\b(property|properties|building|buildings|apartment|apartments|boarding house|boarding houses)\b/', $question)
            && preg_match('/\b(make|create|add|set up|setup|build)\b/', $question)
            && !preg_match('/\b(list|show|count|summary|report)\b/', $question)) {
            return null;
        }

        if (preg_match('/\b(vacant|available|empty)\b/', $question) && preg_match('/\b(unit|units|room|rooms)\b/', $question)) {
            if (preg_match('/\b(how many|count|total)\b/', $question)
                && !preg_match('/\b(list|show|which|what)\b/', $question)) {
                $count = $this->db->raw(
                    "SELECT COUNT(*) AS unit_count FROM units u
                      JOIN properties p ON p.id = u.property_id
                     WHERE p.owner_id = ? AND u.occupancy_status = 'vacant'
                       AND NOT EXISTS (
                         SELECT 1 FROM leases l
                          WHERE l.unit_id = u.id AND l.status IN ('active', 'scheduled')
                       )",
                    [(int) $owner_id]
                )->fetch(PDO::FETCH_ASSOC);
                return 'You have ' . (int) ($count['unit_count'] ?? 0) . ' vacant unit(s).';
            }
            $rows = $this->db->raw(
                "SELECT u.unit_name, u.monthly_rent, p.name AS property_name,
                        p.address, p.barangay, p.city
                   FROM units u JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? AND u.occupancy_status = 'vacant'
                    AND NOT EXISTS (
                      SELECT 1 FROM leases l
                       WHERE l.unit_id = u.id AND l.status IN ('active', 'scheduled')
                    )
                  ORDER BY p.name, u.unit_name LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'vacant unit(s)',
                $rows,
                static function ($row) {
                    $location = implode(', ', array_filter([$row['address'], $row['barangay'], $row['city']]));
                    return $row['property_name'] . ' · ' . $row['unit_name'] . ' · ₱'
                        . number_format((float) $row['monthly_rent'], 2)
                        . ($location !== '' ? ' · ' . $location : '');
                }
            );
        }

        if (preg_match('/\b(unit|units|room|rooms)\b/', $question)
            && preg_match('/\b(name|names|pangalan)\b/', $question)) {
            $rows = $this->db->raw(
                "SELECT p.name AS property_name, u.unit_name
                   FROM units u JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ?
                  ORDER BY p.name, u.unit_name LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'unit name(s)',
                $rows,
                static function ($row) {
                    return $row['property_name'] . ' · ' . $row['unit_name'];
                }
            );
        }

        if (preg_match('/\b(unit|units|room|rooms)\b/', $question)
            && preg_match('/\b(how many|count|list|show|all|which|what|total)\b/', $question)
            && !preg_match('/\b(repair|maintenance|tenant|lease|transfer|move.?in)\b/', $question)) {
            if (preg_match('/\b(how many|count|total)\b/', $question)
                && !preg_match('/\b(list|show|which|what)\b/', $question)) {
                $count = $this->db->raw(
                    'SELECT COUNT(*) AS unit_count FROM units u
                      JOIN properties p ON p.id = u.property_id WHERE p.owner_id = ?',
                    [(int) $owner_id]
                )->fetch(PDO::FETCH_ASSOC);
                return 'You have ' . (int) ($count['unit_count'] ?? 0) . ' unit(s) across your properties.';
            }
            $rows = $this->db->raw(
                "SELECT u.unit_name, u.monthly_rent, u.occupancy_status, p.name AS property_name,
                        CASE WHEN EXISTS (
                          SELECT 1 FROM leases l WHERE l.unit_id = u.id AND l.status IN ('active', 'scheduled')
                        ) THEN 1 ELSE 0 END AS has_current_lease
                   FROM units u JOIN properties p ON p.id = u.property_id
                  WHERE p.owner_id = ? ORDER BY p.name, u.unit_name LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'unit(s)',
                $rows,
                static function ($row) {
                    $status = $row['has_current_lease'] ? 'occupied' : str_replace('_', ' ', $row['occupancy_status']);
                    return $row['property_name'] . ' · ' . $row['unit_name'] . ' · ' . ucfirst($status)
                        . ' · ₱' . number_format((float) $row['monthly_rent'], 2) . '/month';
                }
            );
        }

        if (preg_match('/\b(where|location|located|address|map)\b/', $question)
            && preg_match('/\b(properties|property|buildings|apartments|boarding houses)\b/', $question)) {
            $rows = $this->db->raw(
                'SELECT name, address, barangay, city, latitude, longitude
                   FROM properties WHERE owner_id = ? ORDER BY name LIMIT ' . $limit,
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'property location(s)',
                $rows,
                static function ($row) {
                    $location = implode(', ', array_filter([$row['address'], $row['barangay'], $row['city']]));
                    if ($row['latitude'] !== null && $row['longitude'] !== null) {
                        $location .= ($location !== '' ? ' · ' : '') . $row['latitude'] . ', ' . $row['longitude'];
                    }
                    return $row['name'] . ($location !== '' ? ' · ' . $location : ' · No location recorded');
                }
            );
        }

        if (preg_match('/\b(unpaid|overdue|not paid|has not paid|haven.t paid|hasn.t paid|who did not pay|outstanding)\b/', $question)
            && preg_match('/\b(bill|bills|rent|payment|payments|tenant|tenants|who)\b/', $question)) {
            $rows = $this->db->raw(
                "SELECT t.full_name AS tenant_name, b.amount, b.due_date, b.period_month, b.status,
                        u.unit_name, p.name AS property_name
                   FROM bills b
                   JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                   JOIN users t ON t.id = b.tenant_id
                  WHERE p.owner_id = ? AND b.status IN ('unpaid', 'overdue')
                  ORDER BY b.due_date, p.name, u.unit_name LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'unpaid or overdue bill(s)',
                $rows,
                static function ($row) {
                    return $row['tenant_name'] . ' · ' . $row['property_name'] . ', ' . $row['unit_name']
                        . ' · ' . ucfirst($row['status']) . ' · ₱' . number_format((float) $row['amount'], 2)
                        . ' · due ' . $row['due_date'];
                }
            );
        }

        if (preg_match('/\b(repair|repairs|maintenance|fix|broken)\b/', $question)) {
            $rows = $this->db->raw(
                "SELECT m.title, m.priority, m.status, m.created_at, t.full_name AS tenant_name,
                        u.unit_name, p.name AS property_name
                   FROM maintenance_requests m
                   JOIN units u ON u.id = m.unit_id
                   JOIN properties p ON p.id = u.property_id
                   JOIN users t ON t.id = m.tenant_id
                  WHERE p.owner_id = ? AND m.status IN ('pending', 'in_progress')
                  ORDER BY FIELD(m.priority, 'high', 'medium', 'low'), m.created_at LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'open repair request(s)',
                $rows,
                static function ($row) {
                    $priority = $row['priority'] === 'high' ? 'Urgent' : ucfirst($row['priority']);
                    return $row['property_name'] . ', ' . $row['unit_name'] . ' · ' . $row['title']
                        . ' · ' . $priority . ' · ' . str_replace('_', ' ', $row['status'])
                        . ' · ' . $row['tenant_name'];
                }
            );
        }

        if (preg_match('/\b(transfer|move.?in request|early move)\b/', $question)) {
            $transfers = $this->db->raw(
                "SELECT t.full_name AS tenant_name, cu.unit_name AS current_unit,
                        cp.name AS current_property, ru.unit_name AS requested_unit,
                        rp.name AS requested_property, r.status, r.created_at
                   FROM unit_transfer_requests r
                   JOIN users t ON t.id = r.tenant_id
                   JOIN units cu ON cu.id = r.current_unit_id
                   JOIN properties cp ON cp.id = cu.property_id
                   JOIN units ru ON ru.id = r.requested_unit_id
                   JOIN properties rp ON rp.id = ru.property_id
                  WHERE cp.owner_id = ? AND r.status = 'pending'
                  ORDER BY r.created_at LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            $early = $this->db->raw(
                "SELECT t.full_name AS tenant_name, p.name AS property_name, u.unit_name,
                        r.requested_start_date, r.created_at
                   FROM early_move_in_requests r
                   JOIN leases l ON l.id = r.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                   JOIN users t ON t.id = r.tenant_id
                  WHERE p.owner_id = ? AND r.status = 'pending'
                  ORDER BY r.created_at LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            $items = [];
            foreach ($transfers as $row) {
                $items[] = $row['tenant_name'] . ' · transfer from ' . $row['current_property'] . ', '
                    . $row['current_unit'] . ' to ' . $row['requested_property'] . ', ' . $row['requested_unit'];
            }
            foreach ($early as $row) {
                $items[] = $row['tenant_name'] . ' · early move-in for ' . $row['property_name'] . ', '
                    . $row['unit_name'] . ' · requested ' . $row['requested_start_date'];
            }
            return count($items)
                ? 'Found ' . count($items) . ' pending transfer or move-in request(s):' . "\n- " . implode("\n- ", $items)
                : 'There are no pending transfer or early move-in requests.';
        }

        if (preg_match('/\b(payment|payments|received|paid)\b/', $question)) {
            $rows = $this->db->raw(
                "SELECT t.full_name AS tenant_name, pm.amount, pm.paid_at, pm.created_at,
                        pm.status, u.unit_name, p.name AS property_name, b.period_month
                   FROM payments pm
                   JOIN bills b ON b.id = pm.bill_id
                   JOIN leases l ON l.id = b.lease_id
                   JOIN units u ON u.id = l.unit_id
                   JOIN properties p ON p.id = u.property_id
                   JOIN users t ON t.id = pm.tenant_id
                  WHERE p.owner_id = ? AND pm.status = 'paid'
                  ORDER BY COALESCE(pm.paid_at, pm.created_at) DESC LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'received payment(s)',
                $rows,
                static function ($row) {
                    return $row['tenant_name'] . ' · ' . $row['property_name'] . ', ' . $row['unit_name']
                        . ' · ₱' . number_format((float) $row['amount'], 2)
                        . ' · ' . ($row['paid_at'] ?: $row['created_at'])
                        . ' · ' . $row['period_month'];
                }
            );
        }

        if (preg_match('/\b(lease|leases|tenant|tenants|occupant|occupants)\b/', $question)) {
            $rows = $this->db->raw(
                'SELECT t.full_name AS tenant_name, t.email, t.phone, l.status, l.start_date, l.end_date,
                        u.unit_name, p.name AS property_name
                   FROM users t
                   LEFT JOIN leases l ON l.tenant_id = t.id AND l.status IN (\'offered\', \'scheduled\', \'active\')
                   LEFT JOIN units u ON u.id = l.unit_id
                   LEFT JOIN properties p ON p.id = u.property_id AND p.owner_id = ?
                  WHERE t.landlord_id = ? AND t.role = \'tenant\'
                    AND (l.id IS NULL OR p.owner_id = ?)
                  ORDER BY t.full_name LIMIT ' . $limit,
                [(int) $owner_id, (int) $owner_id, (int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'tenant / lease record(s)',
                $rows,
                static function ($row) {
                    $lease = $row['status']
                        ? ' · ' . str_replace('_', ' ', $row['status']) . ' · ' . $row['property_name'] . ', '
                            . $row['unit_name'] . ' · ' . $row['start_date']
                        : ' · no current lease';
                    return $row['tenant_name'] . $lease;
                }
            );
        }

        if (preg_match('/\b(property|properties|building|buildings)\b/', $question)) {
            $rows = $this->db->raw(
                "SELECT p.name, p.address, p.barangay, p.city, COUNT(u.id) AS unit_count,
                        SUM(u.occupancy_status = 'vacant'
                            AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.unit_id = u.id AND l.status IN ('active', 'scheduled'))) AS vacant_count
                   FROM properties p LEFT JOIN units u ON u.property_id = p.id
                  WHERE p.owner_id = ? GROUP BY p.id ORDER BY p.name LIMIT {$limit}",
                [(int) $owner_id]
            )->fetchAll(PDO::FETCH_ASSOC);
            return $this->format_assistant_rows(
                'property record(s)',
                $rows,
                static function ($row) {
                    $location = implode(', ', array_filter([$row['address'], $row['barangay'], $row['city']]));
                    return $row['name'] . ' · ' . ($location ?: 'No location recorded')
                        . ' · ' . (int) $row['unit_count'] . ' unit(s), '
                        . (int) $row['vacant_count'] . ' vacant';
                }
            );
        }

        return null;
    }

    private function is_property_setup_follow_up(array $history)
    {
        $lastAssistant = null;
        $lastUser = null;
        foreach (array_reverse($history) as $item) {
            if ($lastAssistant === null && $item['role'] === 'assistant') {
                $lastAssistant = $item['content'];
            } elseif ($lastUser === null && $item['role'] === 'user') {
                $lastUser = $item['content'];
            }
            if ($lastAssistant !== null && $lastUser !== null) {
                break;
            }
        }

        return is_string($lastAssistant)
            && is_string($lastUser)
            && preg_match('/\b(make|create|add|set up|setup|build)\b/i', $lastUser)
            && preg_match('/\b(property|properties|building|apartment|boarding house)\b/i', $lastUser)
            && preg_match('/\b(set up|create|new property|property)\b/i', $lastAssistant)
            && preg_match('/\b(name|address|type|unit|rent)\b/i', $lastAssistant);
    }

    private function format_assistant_rows($label, array $rows, callable $format)
    {
        if (!$rows) {
            return 'There are no ' . $label . '.';
        }
        $total = count($rows);
        $shown = array_slice($rows, 0, 100);
        $reply = 'Found ' . ($total > 100 ? 'more than 100' : $total) . ' ' . $label . ':' . "\n- "
            . implode("\n- ", array_map($format, $shown));
        if ($total > 100) {
            $reply .= "\nShowing the first 100 records.";
        }
        return $reply;
    }
}
