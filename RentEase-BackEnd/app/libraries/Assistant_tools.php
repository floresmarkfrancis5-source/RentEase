<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Typed, landlord-scoped assistant tools using LavaLust's shared query builder. */
class Assistant_tools
{
    private $db;
    private $ownerId = 0;
    private $conversationId = 0;
    private $userMessageId = 0;
    private $currentMessage = '';
    private $conversationModel;
    private $paymentModel;
    private $verifiedRecords = [];
    private $definitions;

    public function __construct()
    {
        $this->db = lava_instance()->db;
        $this->definitions = $this->build_definitions();
    }

    public function set_context($ownerId, $conversationId, $userMessageId, $currentMessage, $conversationModel)
    {
        $this->ownerId = (int) $ownerId;
        $this->conversationId = (int) $conversationId;
        $this->userMessageId = (int) $userMessageId;
        $this->currentMessage = trim((string) $currentMessage);
        $this->conversationModel = $conversationModel;
    }

    public function declarations()
    {
        $declarations = [];
        foreach ($this->definitions as $name => $definition) {
            $declarations[] = [
                'name' => $name,
                'description' => $definition['description'],
                'parameters' => $definition['parameters'],
            ];
        }
        return $declarations;
    }

    public function dispatch($name, array $args)
    {
        if (!isset($this->definitions[$name])) {
            return ['error' => 'Unsupported assistant tool.'];
        }
        try {
            $handler = $this->definitions[$name]['handler'];
            $result = $this->{$handler}($args);
            $this->remember_verified_records($name, $result);
            return $result;
        } catch (Throwable $e) {
            if (filter_var(config_item('assistant_debug'), FILTER_VALIDATE_BOOLEAN)) {
                $trace = array_map(static function ($frame) {
                    return [
                        'file' => $frame['file'] ?? null,
                        'line' => $frame['line'] ?? null,
                        'function' => $frame['function'] ?? null,
                    ];
                }, $e->getTrace());
                error_log('RentEase assistant tool failed (' . $name . '): ' . $e->getMessage()
                    . ' Trace: ' . json_encode($trace));
            }
            return ['error' => 'The requested RentEase records or action could not be completed.'];
        }
    }

    public function cancel_pending_for_current_turn()
    {
        if ($this->ownerId < 1 || $this->conversationId < 1 || $this->userMessageId < 1) {
            return 0;
        }
        return $this->db->table('assistant_pending_actions')
            ->where('conversation_id', $this->conversationId)
            ->where('landlord_id', $this->ownerId)
            ->where('created_message_id', $this->userMessageId)
            ->where('status', 'pending')
            ->update(['status' => 'cancelled']);
    }

    private function build_definitions()
    {
        $string = static function ($description, $max = 120) {
            return ['type' => 'STRING', 'description' => $description, 'maxLength' => $max];
        };
        $integer = static function ($description, $minimum = 1, $maximum = 50) {
            return ['type' => 'INTEGER', 'description' => $description, 'minimum' => $minimum, 'maximum' => $maximum];
        };
        $number = static function ($description, $minimum = 0, $maximum = 99999999.99) {
            return ['type' => 'NUMBER', 'description' => $description, 'minimum' => $minimum, 'maximum' => $maximum];
        };
        $boolean = static function ($description) {
            return ['type' => 'BOOLEAN', 'description' => $description];
        };
        $object = static function (array $properties, array $required = []) {
            return [
                'type' => 'OBJECT',
                'properties' => $properties === [] ? (object) [] : $properties,
                'required' => $required,
            ];
        };
        $date = static function ($description) {
            return ['type' => 'STRING', 'description' => $description, 'format' => 'date'];
        };
        $status = static function ($description, array $values) {
            return ['type' => 'STRING', 'description' => $description, 'enum' => $values];
        };

        return [
            'search_properties' => [
                'handler' => 'search_properties',
                'description' => 'Find properties belonging to the signed-in landlord. Optional name and city are case-insensitive partial matches. Returns at most 50 properties with IDs, names, type, and location.',
                'parameters' => $object([
                    'name' => $string('Optional partial property name.'),
                    'city' => $string('Optional partial city name.', 100),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'search_units' => [
                'handler' => 'search_units',
                'description' => 'Find the landlord’s units. Filter by vacant or occupied status, partial property name, and monthly rent range. Returns IDs and only unit/property details needed for rental questions.',
                'parameters' => $object([
                    'occupancy_status' => $status('Optional occupancy filter.', ['vacant', 'occupied']),
                    'property_name' => $string('Optional case-insensitive partial property name.'),
                    'min_rent' => $number('Optional minimum monthly rent.'),
                    'max_rent' => $number('Optional maximum monthly rent.'),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'search_tenants' => [
                'handler' => 'search_tenants',
                'description' => 'Find tenant accounts owned by the signed-in landlord, optionally filtering by case-insensitive partial tenant, unit, or property name. Returns tenant and current unit/property IDs and names.',
                'parameters' => $object([
                    'name' => $string('Optional partial tenant name.'),
                    'unit_name' => $string('Optional partial unit name.'),
                    'property_name' => $string('Optional partial property name.'),
                    'active_only' => $boolean('When true, require an active tenant account and active lease.'),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'get_bills' => [
                'handler' => 'get_bills',
                'description' => 'List the landlord’s bills. Optional filters: tenant name, unit name, billing month (1–12), billing year, and status. For “this month” or “current month,” pass both month and year using the server date in the system instructions. Status must be unpaid, overdue, or paid. Billing period is bills.period_month.',
                'parameters' => $object([
                    'tenant_name' => $string('Optional partial tenant name.'),
                    'unit_name' => $string('Optional partial unit name.'),
                    'month' => $integer('Optional billing month.', 1, 12),
                    'year' => $integer('Optional billing year.', 2000, 2100),
                    'status' => $status('Optional bill status.', ['unpaid', 'overdue', 'paid']),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'get_payments' => [
                'handler' => 'get_payments',
                'description' => 'List payments connected to the landlord’s properties. Optional filters include partial tenant name and inclusive paid/created date range. Never use this tool to record a payment.',
                'parameters' => $object([
                    'tenant_name' => $string('Optional partial tenant name.'),
                    'from_date' => $date('Optional start date, YYYY-MM-DD.'),
                    'to_date' => $date('Optional end date, YYYY-MM-DD.'),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'get_tenant_balance' => [
                'handler' => 'get_tenant_balance',
                'description' => 'Calculate unpaid and overdue bill balances for one landlord-owned tenant. Supply tenant_id after identifying the tenant, or a partial tenant_name. Multiple name matches are returned so the user can choose.',
                'parameters' => $object([
                    'tenant_id' => $integer('Tenant ID returned by search_tenants.', 1, 2147483647),
                    'tenant_name' => $string('Partial tenant name if no tenant ID is known.'),
                    'limit' => $integer('Maximum number of matching tenant names.', 1, 50),
                ]),
            ],
            'get_overdue_summary' => [
                'handler' => 'get_overdue_summary',
                'description' => 'Summarize overdue bills for the signed-in landlord. Includes bills marked overdue and unpaid bills whose due date has passed. Returns the first 50 bill details plus total and amount for those returned.',
                'parameters' => $object([
                    'limit' => $integer('Maximum number of bill details.', 1, 50),
                ]),
            ],
            'get_maintenance_requests' => [
                'handler' => 'get_maintenance_requests',
                'description' => 'List maintenance requests for units in the landlord’s properties. Optional status and partial property-name filters.',
                'parameters' => $object([
                    'status' => $status('Optional request status.', ['pending', 'in_progress', 'resolved']),
                    'property_name' => $string('Optional partial property name.'),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'get_move_requests' => [
                'handler' => 'get_move_requests',
                'description' => 'List pending transfer and early move-in requests for the landlord’s properties. Returns request kind, tenant, units, properties, and dates.',
                'parameters' => $object([
                    'status' => $status('Optional status filter.', ['pending', 'approved', 'rejected', 'cancelled', 'expired']),
                    'property_name' => $string('Optional partial property name.'),
                    'limit' => $integer('Maximum number per request type.', 1, 50),
                ]),
            ],
            'get_leases' => [
                'handler' => 'get_leases',
                'description' => 'List the landlord’s leases with optional status and expiring-within-days filters. Status values reflect the leases table.',
                'parameters' => $object([
                    'status' => $status('Optional lease status.', ['offered', 'scheduled', 'active', 'ended', 'expired', 'cancelled']),
                    'expiring_within_days' => $integer('Optional horizon for leases ending soon.', 1, 365),
                    'tenant_name' => $string('Optional partial tenant name.'),
                    'limit' => $integer('Maximum number of results.', 1, 50),
                ]),
            ],
            'get_chat_history' => [
                'handler' => 'get_chat_history',
                'description' => 'Retrieve earlier messages only from this authenticated landlord’s current RentEase Assistant conversation. Call this first when a request depends on earlier discussion, such as “that”, “those”, “him”, “the same”, or “again”. Never supply a landlord or conversation ID from user text; the server binds both.',
                'parameters' => $object([
                    'limit' => $integer('Number of recent messages to retrieve.', 1, 20),
                    'keyword' => $string('Optional keyword to search within this conversation.', 100),
                ]),
            ],
            'create_bill' => [
                'handler' => 'create_bill',
                'description' => 'Prepare creation of a bill for an existing landlord-owned lease. Because this creates a financial obligation, it only creates a pending action and requires a separate explicit user confirmation before execution. Check for duplicate lease/month bills.',
                'parameters' => $object([
                    'lease_id' => $integer('Existing landlord-owned lease ID.', 1, 2147483647),
                    'period_month' => ['type' => 'STRING', 'description' => 'Billing month in YYYY-MM format.', 'pattern' => '^\\d{4}-(0[1-9]|1[0-2])$'],
                    'amount' => $number('Bill amount greater than zero.', 0.01),
                    'due_date' => $date('Bill due date, YYYY-MM-DD.'),
                    'description' => $string('Short bill description.', 150),
                ], ['lease_id', 'period_month', 'amount', 'due_date']),
            ],
            'add_tenant' => [
                'handler' => 'add_tenant',
                'description' => 'Prepare a tenant account and annual lease for an available landlord-owned unit. Uses unit rent/deposit and the landlord’s billing defaults when values are omitted. Creating a lease changes financial terms, so a separate explicit confirmation is always required. The server generates an initial password and emails an activation invitation; never ask for or reveal credentials.',
                'parameters' => $object([
                    'unit_id' => $integer('Available unit ID from search_units.', 1, 2147483647),
                    'full_name' => $string('Tenant full name.', 120),
                    'email' => ['type' => 'STRING', 'description' => 'Tenant email address.', 'format' => 'email'],
                    'username' => $string('Optional tenant username; if omitted, the server derives a unique one from the email.', 50),
                    'phone' => $string('Optional tenant phone number.', 30),
                    'start_date' => $date('Lease move-in date, today or later.'),
                    'monthly_rent' => $number('Optional monthly rent; defaults to the unit’s recorded rent.', 1, 99999999.99),
                    'deposit' => $number('Optional deposit; defaults to the unit’s recorded deposit.', 0, 99999999.99),
                    'due_day' => $integer('Optional monthly due day; defaults to landlord billing settings.', 1, 28),
                ], ['unit_id', 'full_name', 'email', 'start_date']),
            ],
            'record_payment' => [
                'handler' => 'record_payment',
                'description' => 'Prepare to record a cash or bank-transfer payment for a landlord-owned unpaid bill. The amount must equal the full outstanding bill amount. This changes money records and requires a separate explicit user confirmation.',
                'parameters' => $object([
                    'bill_id' => $integer('Unpaid landlord-owned bill ID.', 1, 2147483647),
                    'amount' => $number('Full bill amount being paid; partial payments are not supported.', 0.01),
                    'method' => $status('Manual payment method only.', ['cash', 'bank_transfer']),
                    'notes' => $string('Optional receipt note.', 255),
                ], ['bill_id', 'amount', 'method']),
            ],
            'update_bill' => [
                'handler' => 'update_bill',
                'description' => 'Prepare to change an unpaid landlord-owned bill amount, due date, or notes. Any change to a bill requires explicit confirmation. Find and verify the exact bill first.',
                'parameters' => $object([
                    'bill_id' => $integer('Bill ID from get_bills.', 1, 2147483647),
                    'amount' => $number('Optional replacement amount greater than zero.', 0.01),
                    'due_date' => $date('Optional replacement due date.'),
                    'notes' => $string('Optional replacement internal note.', 500),
                ], ['bill_id']),
            ],
            'update_unit' => [
                'handler' => 'update_unit',
                'description' => 'Prepare to update a landlord-owned unit. Supported fields are name, monthly rent, default deposit/due day, capacity, condition, and notes. Requires explicit confirmation because rent/deposit may change.',
                'parameters' => $object([
                    'unit_id' => $integer('Unit ID from search_units.', 1, 2147483647),
                    'unit_name' => $string('Optional replacement unit name.', 50),
                    'monthly_rent' => $number('Optional replacement monthly rent.', 0),
                    'default_deposit' => $number('Optional replacement deposit.', 0),
                    'default_due_day' => $integer('Optional due day.', 1, 28),
                    'capacity' => $integer('Optional unit capacity.', 1, 50),
                    'condition_tag' => $status('Optional condition.', ['good_condition', 'under_maintenance']),
                    'notes' => $string('Optional unit note.', 255),
                ], ['unit_id']),
            ],
            'update_property' => [
                'handler' => 'update_property',
                'description' => 'Update non-financial details of an existing landlord-owned property. Find and verify the exact property first. Allowed fields are name, type, address, city, barangay, and description.',
                'parameters' => $object([
                    'property_id' => $integer('Property ID from search_properties.', 1, 2147483647),
                    'name' => $string('Optional replacement property name.', 120),
                    'type' => $status('Optional property type.', ['apartment', 'boarding_house']),
                    'address' => $string('Optional street address.', 255),
                    'city' => $string('Optional city.', 100),
                    'barangay' => $string('Optional barangay.', 100),
                    'description' => $string('Optional description.', 2000),
                ], ['property_id']),
            ],
            'delete_unit' => [
                'handler' => 'delete_unit',
                'description' => 'Prepare reversible archiving of a landlord-owned unit. Requires explicit confirmation. All related history is preserved, but units with active, scheduled, or offered leases cannot be archived.',
                'parameters' => $object(['unit_id' => $integer('Unit ID from search_units.', 1, 2147483647)], ['unit_id']),
            ],
            'delete_bill' => [
                'handler' => 'delete_bill',
                'description' => 'Prepare deletion of an unpaid landlord-owned bill. Requires explicit confirmation. Paid bills and bills with payment history cannot be deleted.',
                'parameters' => $object(['bill_id' => $integer('Bill ID from get_bills.', 1, 2147483647)], ['bill_id']),
            ],
            'confirm_action' => [
                'handler' => 'confirm_action',
                'description' => 'Execute the most recent pending action for this landlord and conversation only when the current user message is an explicit confirmation and the action has not expired. The server selects the action; do not provide an ID.',
                'parameters' => $object([]),
            ],
            'lookup_rental_records' => [
                'handler' => 'lookup_rental_records',
                'description' => 'Legacy fallback for older rental-record questions. Prefer the focused typed search tools. Results remain limited to the authenticated landlord.',
                'parameters' => $object([
                    'question' => $string('Natural-language rental-record question.', 1000),
                ], ['question']),
            ],
        ];
    }

    private function limit(array $args)
    {
        return max(1, min(50, (int) ($args['limit'] ?? 20)));
    }

    private function rows($query, $limit)
    {
        $rows = $query->limit(min(51, $limit + 1))->get_all(PDO::FETCH_ASSOC);
        $truncated = count($rows) > $limit;
        return [$truncated ? array_slice($rows, 0, $limit) : $rows, $truncated];
    }

    private function remember_verified_records($toolName, array $result)
    {
        $keys = [
            'search_properties' => ['properties' => 'records'],
            'search_units' => ['units' => 'records'],
            'search_tenants' => ['tenants' => 'records'],
            'get_bills' => ['bills' => 'records'],
            'get_overdue_summary' => ['bills' => 'records'],
            'get_leases' => ['leases' => 'records'],
            'get_tenant_balance' => ['tenants' => 'records'],
        ];
        if ($toolName === 'lookup_rental_records') {
            $keys = [
                'properties' => 'records',
                'units' => 'records',
                'tenants' => 'records',
                'bills' => 'records',
                'leases' => 'records',
            ];
        } else {
            $keys = $keys[$toolName] ?? [];
        }
        foreach ($keys as $entity => $field) {
            $records = $result[$field] ?? [];
            if ($toolName === 'get_tenant_balance' && isset($result['tenant'])) {
                $records[] = $result['tenant'];
            }
            if (!is_array($records)) {
                continue;
            }
            foreach ($records as $record) {
                if (is_array($record) && isset($record['id']) && is_numeric($record['id'])) {
                    $this->verifiedRecords[$entity][(int) $record['id']] = true;
                }
            }
        }
    }

    private function was_verified($entity, $id)
    {
        return isset($this->verifiedRecords[$entity][(int) $id]);
    }

    private function result(array $records, $truncated = false)
    {
        if (!$records) {
            return ['found' => false, 'message' => 'No records matched'];
        }
        return [
            'found' => true,
            'records' => $records,
            'truncated' => (bool) $truncated,
        ];
    }

    private function like($query, $field, $value)
    {
        if (is_string($value) && trim($value) !== '') {
            $query->like('LOWER(' . $field . ')', '%' . mb_strtolower(trim($value)) . '%');
        }
        return $query;
    }

    private function optional_enum_error(array $args, $field, array $allowed)
    {
        return array_key_exists($field, $args) && !in_array($args[$field], $allowed, true)
            ? ['error' => 'Unsupported ' . str_replace('_', ' ', $field) . ' filter.']
            : null;
    }

    private function search_properties(array $args)
    {
        $query = $this->db->table('properties')
            ->select('properties.id, properties.name, properties.type, properties.address, properties.barangay, properties.city')
            ->where('properties.owner_id', $this->ownerId)
            ->where_null('properties.archived_at')
            ->order_by('properties.name');
        $this->like($query, 'properties.name', $args['name'] ?? null);
        $this->like($query, 'properties.city', $args['city'] ?? null);
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function search_units(array $args)
    {
        $statusError = $this->optional_enum_error($args, 'occupancy_status', ['vacant', 'occupied']);
        if ($statusError) {
            return $statusError;
        }
        foreach (['min_rent', 'max_rent'] as $field) {
            if (array_key_exists($field, $args)
                && (!is_numeric($args[$field]) || (float) $args[$field] < 0 || (float) $args[$field] > 99999999.99)) {
                return ['error' => 'Rent filters must be valid non-negative amounts.'];
            }
        }
        if (isset($args['min_rent'], $args['max_rent']) && (float) $args['min_rent'] > (float) $args['max_rent']) {
            return ['error' => 'Minimum rent cannot exceed maximum rent.'];
        }
        $query = $this->db->table('units')
            ->select('units.id, units.unit_name, units.property_id, units.monthly_rent, units.occupancy_status, units.condition_tag, properties.name AS property_name')
            ->join('properties', 'properties.id = units.property_id')
            ->where('properties.owner_id', $this->ownerId)
            ->where_null('units.archived_at')
            ->where_null('properties.archived_at')
            ->order_by('properties.name')
            ->order_by('units.unit_name');
        if (in_array($args['occupancy_status'] ?? null, ['vacant', 'occupied'], true)) {
            $query->where('units.occupancy_status', $args['occupancy_status']);
        }
        $this->like($query, 'properties.name', $args['property_name'] ?? null);
        if (isset($args['min_rent']) && is_numeric($args['min_rent'])) {
            $query->where('units.monthly_rent', '>=', (float) $args['min_rent']);
        }
        if (isset($args['max_rent']) && is_numeric($args['max_rent'])) {
            $query->where('units.monthly_rent', '<=', (float) $args['max_rent']);
        }
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function search_tenants(array $args)
    {
        $query = $this->db->table('users')
            ->select('users.id, users.full_name, users.is_active, leases.id AS lease_id, leases.status AS lease_status, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->left_join(
                'leases',
                "leases.tenant_id = users.id AND leases.status IN ('offered','scheduled','active')"
                    . ' AND EXISTS (SELECT 1 FROM units assistant_units'
                    . ' JOIN properties assistant_properties ON assistant_properties.id = assistant_units.property_id'
                    . ' WHERE assistant_units.id = leases.unit_id AND assistant_properties.owner_id = '
                    . (int) $this->ownerId . ')'
            )
            ->left_join('units', 'units.id = leases.unit_id')
            ->left_join('properties', 'properties.id = units.property_id')
            ->where('users.landlord_id', $this->ownerId)
            ->where('users.role', 'tenant')
            ->order_by('users.full_name');
        $this->like($query, 'users.full_name', $args['name'] ?? null);
        $this->like($query, 'units.unit_name', $args['unit_name'] ?? null);
        $this->like($query, 'properties.name', $args['property_name'] ?? null);
        if (!empty($args['active_only'])) {
            $query->where('users.is_active', 1)->where('leases.status', 'active');
        }
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function get_bills(array $args)
    {
        $statusError = $this->optional_enum_error($args, 'status', ['unpaid', 'overdue', 'paid']);
        if ($statusError) {
            return $statusError;
        }
        if (array_key_exists('month', $args)
            && filter_var($args['month'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]) === false) {
            return ['error' => 'Billing month must be between 1 and 12.'];
        }
        if (array_key_exists('year', $args)
            && filter_var($args['year'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 2000, 'max_range' => 2100]]) === false) {
            return ['error' => 'Billing year must be between 2000 and 2100.'];
        }
        $query = $this->db->table('bills')
            ->select('bills.id, bills.tenant_id, users.full_name AS tenant_name, bills.lease_id, bills.period_month, bills.description, bills.amount, bills.due_date, bills.status, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->join('leases', 'leases.id = bills.lease_id')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = bills.tenant_id')
            ->where('properties.owner_id', $this->ownerId)
            ->order_by('bills.due_date', 'DESC')
            ->order_by('bills.id', 'DESC');
        if (in_array($args['status'] ?? null, ['unpaid', 'overdue', 'paid'], true)) {
            $query->where('bills.status', $args['status']);
        }
        if (isset($args['month']) && is_numeric($args['month']) && (int) $args['month'] >= 1 && (int) $args['month'] <= 12) {
            if (isset($args['year']) && is_numeric($args['year'])) {
                $query->where('bills.period_month', sprintf('%04d-%02d', (int) $args['year'], (int) $args['month']));
            } else {
                $query->like('bills.period_month', '%-' . str_pad((string) (int) $args['month'], 2, '0', STR_PAD_LEFT));
            }
        } elseif (isset($args['year']) && is_numeric($args['year'])) {
            $year = (int) $args['year'];
            $query->where('bills.period_month', '>=', sprintf('%04d-01', $year))
                ->where('bills.period_month', '<=', sprintf('%04d-12', $year));
        }
        $this->like($query, 'users.full_name', $args['tenant_name'] ?? null);
        $this->like($query, 'units.unit_name', $args['unit_name'] ?? null);
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function get_payments(array $args)
    {
        foreach (['from_date', 'to_date'] as $field) {
            if (array_key_exists($field, $args) && !empty($args[$field]) && !$this->valid_date($args[$field])) {
                return ['error' => 'Payment date filters must be valid YYYY-MM-DD dates.'];
            }
        }
        if (!empty($args['from_date']) && !empty($args['to_date']) && $args['from_date'] > $args['to_date']) {
            return ['error' => 'The payment start date cannot be after its end date.'];
        }
        $query = $this->payment_query()
            ->where('properties.owner_id', $this->ownerId)
            ->order_by('payments.created_at', 'DESC')
            ->order_by('payments.id', 'DESC');
        $this->like($query, 'users.full_name', $args['tenant_name'] ?? null);
        if (!empty($args['from_date']) && $this->valid_date($args['from_date'])) {
            $query->where('COALESCE(payments.paid_at, payments.created_at)', '>=', $args['from_date'] . ' 00:00:00');
        }
        if (!empty($args['to_date']) && $this->valid_date($args['to_date'])) {
            $query->where('COALESCE(payments.paid_at, payments.created_at)', '<=', $args['to_date'] . ' 23:59:59');
        }
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function payment_query()
    {
        return $this->db->table('payments')
            ->select('payments.id, payments.bill_id, payments.tenant_id, users.full_name AS tenant_name, payments.amount, payments.method, payments.status, payments.paid_at, payments.created_at, bills.period_month, units.unit_name, properties.name AS property_name')
            ->join('bills', 'bills.id = payments.bill_id')
            ->join('leases', 'leases.id = bills.lease_id')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = payments.tenant_id');
    }

    private function get_tenant_balance(array $args)
    {
        $tenantQuery = $this->db->table('users')
            ->select('users.id, users.full_name')
            ->where('users.landlord_id', $this->ownerId)
            ->where('users.role', 'tenant');
        if (!empty($args['tenant_id'])) {
            $tenantQuery->where('users.id', (int) $args['tenant_id']);
        } else {
            $this->like($tenantQuery, 'users.full_name', $args['tenant_name'] ?? null);
        }
        $tenantRows = $tenantQuery->limit($this->limit($args))->get_all(PDO::FETCH_ASSOC);
        if (!$tenantRows) {
            return $this->result([]);
        }
        if (count($tenantRows) > 1) {
            return $this->result($tenantRows);
        }
        $tenant = $tenantRows[0];
        $balanceTotals = $this->bill_query()
            ->select('COUNT(bills.id) AS bill_count, SUM(bills.amount) AS balance')
            ->where('properties.owner_id', $this->ownerId)
            ->where('bills.tenant_id', (int) $tenant['id'])
            ->where_in('bills.status', ['unpaid', 'overdue'])
            ->get();
        $bills = $this->db->table('bills')
            ->select('bills.id, bills.period_month, bills.amount, bills.due_date, bills.status')
            ->join('leases', 'leases.id = bills.lease_id')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->where('properties.owner_id', $this->ownerId)
            ->where('bills.tenant_id', (int) $tenant['id'])
            ->where_in('bills.status', ['unpaid', 'overdue'])
            ->order_by('bills.due_date')
            ->limit(50)
            ->get_all(PDO::FETCH_ASSOC);
        return [
            'found' => true,
            'tenant' => $tenant,
            'balance' => round((float) ($balanceTotals['balance'] ?? 0), 2),
            'unpaid_bill_count' => (int) ($balanceTotals['bill_count'] ?? 0),
            'currency' => 'PHP',
            'bills' => $bills,
        ];
    }

    private function get_overdue_summary(array $args)
    {
        $query = $this->bill_query()
            ->where('properties.owner_id', $this->ownerId)
            ->where_in('bills.status', ['unpaid', 'overdue'])
            ->where('bills.due_date', '<', date('Y-m-d'))
            ->order_by('bills.due_date');
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        $totals = $this->bill_query()
            ->select('COUNT(bills.id) AS total_count, SUM(bills.amount) AS total_amount')
            ->where('properties.owner_id', $this->ownerId)
            ->where_in('bills.status', ['unpaid', 'overdue'])
            ->where('bills.due_date', '<', date('Y-m-d'))
            ->get();
        if ((int) ($totals['total_count'] ?? 0) === 0) {
            return ['found' => false, 'message' => 'No records matched'];
        }
        return [
            'found' => (bool) $rows,
            'message' => null,
            'count' => (int) $totals['total_count'],
            'amount' => round((float) ($totals['total_amount'] ?? 0), 2),
            'currency' => 'PHP',
            'truncated' => $truncated,
            'records' => $rows,
        ];
    }

    private function bill_query()
    {
        return $this->db->table('bills')
            ->select('bills.id, bills.tenant_id, users.full_name AS tenant_name, bills.lease_id, bills.period_month, bills.description, bills.amount, bills.due_date, bills.status, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->join('leases', 'leases.id = bills.lease_id')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = bills.tenant_id');
    }

    private function get_maintenance_requests(array $args)
    {
        $statusError = $this->optional_enum_error($args, 'status', ['pending', 'in_progress', 'resolved']);
        if ($statusError) {
            return $statusError;
        }
        $query = $this->db->table('maintenance_requests')
            ->select('maintenance_requests.id, maintenance_requests.title, maintenance_requests.category, maintenance_requests.priority, maintenance_requests.status, maintenance_requests.created_at, users.id AS tenant_id, users.full_name AS tenant_name, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->join('units', 'units.id = maintenance_requests.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = maintenance_requests.tenant_id')
            ->where('properties.owner_id', $this->ownerId)
            ->order_by('maintenance_requests.created_at', 'DESC');
        if (in_array($args['status'] ?? null, ['pending', 'in_progress', 'resolved'], true)) {
            $query->where('maintenance_requests.status', $args['status']);
        }
        $this->like($query, 'properties.name', $args['property_name'] ?? null);
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function get_move_requests(array $args)
    {
        $statusError = $this->optional_enum_error($args, 'status', ['pending', 'approved', 'rejected', 'cancelled', 'expired']);
        if ($statusError) {
            return $statusError;
        }
        $limit = $this->limit($args);
        $transfers = $this->db->table('unit_transfer_requests')
            ->select('unit_transfer_requests.id, unit_transfer_requests.status, unit_transfer_requests.created_at, users.id AS tenant_id, users.full_name AS tenant_name, current_unit.unit_name AS current_unit, current_property.name AS current_property, requested_unit.unit_name AS requested_unit, requested_property.name AS requested_property')
            ->join('users', 'users.id = unit_transfer_requests.tenant_id')
            ->join('units current_unit', 'current_unit.id = unit_transfer_requests.current_unit_id')
            ->join('properties current_property', 'current_property.id = current_unit.property_id')
            ->join('units requested_unit', 'requested_unit.id = unit_transfer_requests.requested_unit_id')
            ->join('properties requested_property', 'requested_property.id = requested_unit.property_id')
            ->where('current_property.owner_id', $this->ownerId)
            ->where('requested_property.owner_id', $this->ownerId)
            ->order_by('unit_transfer_requests.created_at', 'DESC');
        if (!empty($args['status'])) {
            $transfers->where('unit_transfer_requests.status', $args['status']);
        } else {
            $transfers->where('unit_transfer_requests.status', 'pending');
        }
        if (!empty($args['property_name'])) {
            $transfers->grouped(function ($query) use ($args) {
                $query->where('LOWER(current_property.name)', 'LIKE', '%' . mb_strtolower(trim($args['property_name'])) . '%')
                    ->or_where('LOWER(requested_property.name)', 'LIKE', '%' . mb_strtolower(trim($args['property_name'])) . '%');
            });
        }
        $transferRows = $transfers->limit($limit)->get_all(PDO::FETCH_ASSOC);

        $early = $this->db->table('early_move_in_requests')
            ->select('early_move_in_requests.id, early_move_in_requests.status, early_move_in_requests.created_at, early_move_in_requests.requested_start_date, users.id AS tenant_id, users.full_name AS tenant_name, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->join('leases', 'leases.id = early_move_in_requests.lease_id')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = early_move_in_requests.tenant_id')
            ->where('properties.owner_id', $this->ownerId)
            ->order_by('early_move_in_requests.created_at', 'DESC');
        $early->where('early_move_in_requests.status', $args['status'] ?? 'pending');
        $this->like($early, 'properties.name', $args['property_name'] ?? null);
        $earlyRows = $early->limit($limit)->get_all(PDO::FETCH_ASSOC);

        $records = [];
        foreach ($transferRows as $row) {
            $row['request_type'] = 'transfer';
            $records[] = $row;
        }
        foreach ($earlyRows as $row) {
            $row['request_type'] = 'early_move_in';
            $records[] = $row;
        }
        return $this->result(array_slice($records, 0, $limit), count($records) > $limit);
    }

    private function get_leases(array $args)
    {
        $statusError = $this->optional_enum_error($args, 'status', ['offered', 'scheduled', 'active', 'ended', 'expired', 'cancelled']);
        if ($statusError) {
            return $statusError;
        }
        if (array_key_exists('expiring_within_days', $args)
            && filter_var($args['expiring_within_days'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 365]]) === false) {
            return ['error' => 'Expiring-within-days must be between 1 and 365.'];
        }
        $query = $this->db->table('leases')
            ->select('leases.id, leases.tenant_id, users.full_name AS tenant_name, leases.unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name, leases.start_date, leases.end_date, leases.monthly_rent, leases.status')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = leases.tenant_id')
            ->where('properties.owner_id', $this->ownerId)
            ->order_by('leases.end_date')
            ->order_by('leases.id', 'DESC');
        if (in_array($args['status'] ?? null, ['offered', 'scheduled', 'active', 'ended', 'expired', 'cancelled'], true)) {
            $query->where('leases.status', $args['status']);
        }
        $this->like($query, 'users.full_name', $args['tenant_name'] ?? null);
        if (isset($args['expiring_within_days']) && is_numeric($args['expiring_within_days'])) {
            $days = max(1, min(365, (int) $args['expiring_within_days']));
            $query->where('leases.status', 'active')
                ->where_not_null('leases.end_date')
                ->where('leases.end_date', '>=', date('Y-m-d'))
                ->where('leases.end_date', '<=', date('Y-m-d', strtotime('+' . $days . ' days')));
        }
        list($rows, $truncated) = $this->rows($query, $this->limit($args));
        return $this->result($rows, $truncated);
    }

    private function get_chat_history(array $args)
    {
        if (!$this->conversationModel || !$this->conversationId) {
            return ['found' => false, 'message' => 'No active conversation is available.'];
        }
        if (array_key_exists('keyword', $args)
            && (!is_string($args['keyword']) || mb_strlen($args['keyword']) > 100)) {
            return ['error' => 'The chat-history keyword must be text of 100 characters or fewer.'];
        }
        $records = $this->conversationModel->get_chat_history(
            $this->conversationId,
            $this->ownerId,
            $this->limit(array_merge($args, ['limit' => min(20, (int) ($args['limit'] ?? 10))])),
            isset($args['keyword']) ? trim((string) $args['keyword']) : null
        );
        return $this->result($records);
    }

    private function create_bill(array $args)
    {
        $leaseId = $this->required_id($args, 'lease_id');
        if (!$this->was_verified('leases', $leaseId)) {
            return ['error' => 'Search for and verify the exact lease before creating a bill.'];
        }
        $period = $args['period_month'] ?? null;
        $amount = $args['amount'] ?? null;
        $dueDate = $args['due_date'] ?? null;
        $description = $args['description'] ?? null;
        if (!is_string($period) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)
            || !is_numeric($amount) || (float) $amount <= 0
            || (float) $amount > 99999999.99
            || !$this->valid_date($dueDate)
            || ($description !== null && (!is_string($description) || mb_strlen(trim($description)) > 150))) {
            return ['error' => 'A valid billing month, positive amount, and due date are required.'];
        }
        $period = trim($period);
        $lease = $this->owned_lease($leaseId);
        if (!$lease) {
            return ['error' => 'Lease not found in this landlord account.'];
        }
        if ($this->db->table('bills')->select('id')->where('lease_id', $leaseId)->where('period_month', $period)->limit(1)->get()) {
            return ['error' => 'A bill already exists for this lease and billing month.'];
        }
        return $this->request_confirmation('create_bill', [
            'lease_id' => $leaseId,
            'period_month' => $period,
            'amount' => round((float) $amount, 2),
            'due_date' => $dueDate,
            'description' => $description !== null && trim($description) !== '' ? trim($description) : 'Rent for ' . $period,
        ], 'Create a ₱' . number_format((float) $amount, 2) . ' bill for '
            . $lease['tenant_name'] . ' at ' . $lease['property_name'] . ', ' . $lease['unit_name']
            . ' for ' . $period . ', due ' . $dueDate . '?');
    }

    private function add_tenant(array $args)
    {
        $unitId = $this->required_id($args, 'unit_id');
        if (!$this->was_verified('units', $unitId)) {
            return ['error' => 'Search for and verify the exact unit before creating a tenant lease.'];
        }
        $name = $args['full_name'] ?? null;
        $email = $args['email'] ?? null;
        $startDate = $args['start_date'] ?? null;
        $username = $args['username'] ?? '';
        $phone = $args['phone'] ?? '';
        if (!is_string($name) || !is_string($email) || !is_string($username) || !is_string($phone)) {
            return ['error' => 'Tenant name, email, username, and phone must be text values.'];
        }
        $name = trim($name);
        $email = strtolower(trim($email));
        $username = trim($username);
        $phone = trim($phone);
        if (mb_strlen($name) < 2 || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)
            || !$this->valid_date($startDate) || $startDate < date('Y-m-d')
            || ($phone !== '' && mb_strlen($phone) > 30)) {
            return ['error' => 'Provide a valid tenant name, email, optional phone, and move-in date that is today or later.'];
        }

        $userModel = $this->load_model('User_model');
        if ($userModel->find_by_email($email)) {
            return ['error' => 'That email address already has an account.'];
        }
        if ($username !== '' && (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)
            || $userModel->field_taken('username', $username))) {
            return ['error' => 'Choose an available username using 3–50 letters, numbers, dots, dashes, or underscores.'];
        }
        $username = $username !== '' ? $username : $userModel->unique_username($email);

        $unitModel = $this->load_model('Unit_model');
        $unit = $unitModel->available_for_lease($unitId, false, $this->ownerId);
        if (!$unit) {
            return ['error' => 'Choose a vacant, good-condition unit in this landlord account.'];
        }
        $settings = $this->load_model('Site_setting_model')->get_all($this->ownerId);
        $rent = $args['monthly_rent'] ?? $unit['monthly_rent'];
        $deposit = $args['deposit'] ?? ($unit['default_deposit'] ?? 0);
        if (!is_numeric($rent) || (float) $rent < 1 || (float) $rent > 99999999.99
            || !is_numeric($deposit) || (float) $deposit < 0 || (float) $deposit > 99999999.99) {
            return ['error' => 'Monthly rent must be positive and the deposit must be a valid non-negative amount.'];
        }
        $rent = round((float) $rent, 2);
        $deposit = round((float) $deposit, 2);
        $billingStyle = (string) $settings['billing_style'];
        $dueDay = isset($args['due_day']) ? (int) $args['due_day'] : (int) $settings['billing_due_day'];
        if ($billingStyle === 'anniversary') {
            $dueDay = (int) date('j', strtotime($startDate));
            if ($dueDay > 28) {
                return ['error' => 'Anniversary billing requires a lease start date on or before the 28th.'];
            }
        } elseif ($billingStyle === 'first_of_month') {
            if (date('j', strtotime($startDate)) !== '1') {
                return ['error' => 'This landlord requires leases to start on the first day of a month.'];
            }
            $dueDay = 1;
        } elseif ($dueDay < 1 || $dueDay > 28) {
            return ['error' => 'The monthly due day must be between 1 and 28.'];
        }
        $lateFee = (float) $settings['billing_late_fee'];
        if ($lateFee > $rent) {
            return ['error' => 'The landlord’s late fee cannot exceed the monthly rent.'];
        }
        $unitTemplate = $unit['contract_template'] ?: ($unit['property_contract_template'] ?? null);
        $template = $unitTemplate ? json_decode($unitTemplate, true) : null;
        $contractRequired = !empty($template['enabled']);
        if ($contractRequired && $startDate <= date('Y-m-d')) {
            return ['error' => 'A contract approval lease requires a future move-in date.'];
        }

        $pending = [
            'unit_id' => $unitId,
            'username' => $username,
            'email' => $email,
            'full_name' => $name,
            'phone' => $phone !== '' ? $phone : null,
            'start_date' => $startDate,
            'monthly_rent' => $rent,
            'deposit' => $deposit,
            'due_day' => $dueDay,
            'billing_style' => $billingStyle,
            'prorate_first_month' => $settings['billing_prorate_first_month'] === '1',
            'grace_period_days' => (int) $settings['billing_grace_period_days'],
            'late_fee' => $lateFee,
            'contract_required' => $contractRequired,
        ];
        $summary = 'Create an annual lease for ' . $name . ' (' . $email . ') in '
            . $unit['property_name'] . ', ' . $unit['unit_name'] . ' starting ' . $startDate
            . ', with monthly rent ₱' . number_format($rent, 2)
            . ', deposit ₱' . number_format($deposit, 2)
            . ', due day ' . $dueDay . ', and late fee ₱' . number_format($lateFee, 2)
            . ($contractRequired ? ', including the existing contract approval flow' : '') . '?';
        return $this->request_confirmation('add_tenant', $pending, $summary);
    }

    private function record_payment(array $args)
    {
        $billId = $this->required_id($args, 'bill_id');
        if (!$this->was_verified('bills', $billId)) {
            return ['error' => 'Search for and verify the exact bill before recording a payment.'];
        }
        $amount = $args['amount'] ?? null;
        $method = $args['method'] ?? null;
        $notes = $args['notes'] ?? '';
        if (!is_numeric($amount) || (float) $amount <= 0 || (float) $amount > 99999999.99
            || !in_array($method, ['cash', 'bank_transfer'], true)
            || !is_string($notes) || mb_strlen($notes) > 255) {
            return ['error' => 'Enter a positive amount and choose cash or bank transfer.'];
        }
        $bill = $this->owned_bill($billId);
        if (!$bill) {
            return ['error' => 'Bill not found in this landlord account.'];
        }
        if ($bill['status'] === 'paid' || abs((float) $bill['amount'] - (float) $amount) > 0.009) {
            return ['error' => 'The bill must be unpaid and the amount must equal its full outstanding amount.'];
        }
        return $this->request_confirmation('record_payment', [
            'bill_id' => $billId,
            'amount' => round((float) $amount, 2),
            'method' => $method,
            'notes' => trim((string) ($args['notes'] ?? '')),
        ], 'Record a full ₱' . number_format((float) $amount, 2) . ' ' . str_replace('_', ' ', $method)
            . ' payment from ' . $bill['tenant_name'] . ' for the ' . $bill['period_month']
            . ' bill at ' . $bill['property_name'] . ', ' . $bill['unit_name'] . '?');
    }

    private function update_bill(array $args)
    {
        $id = $this->required_id($args, 'bill_id');
        if (!$this->was_verified('bills', $id)) {
            return ['error' => 'Search for and verify the exact bill before editing it.'];
        }
        $bill = $this->owned_bill($id);
        if (!$bill || $bill['status'] === 'paid') {
            return ['error' => 'An unpaid landlord-owned bill is required.'];
        }
        $changes = [];
        if (array_key_exists('amount', $args)) {
            if (!is_numeric($args['amount']) || (float) $args['amount'] <= 0 || (float) $args['amount'] > 99999999.99) {
                return ['error' => 'Bill amount must be greater than zero.'];
            }
            $changes['amount'] = round((float) $args['amount'], 2);
        }
        if (array_key_exists('due_date', $args)) {
            if (!$this->valid_date($args['due_date'])) {
                return ['error' => 'Due date must be a real date in YYYY-MM-DD format.'];
            }
            $changes['due_date'] = $args['due_date'];
        }
        if (array_key_exists('notes', $args)) {
            if (!is_string($args['notes']) || mb_strlen($args['notes']) > 500) {
                return ['error' => 'Bill notes must be 500 characters or fewer.'];
            }
            $changes['notes'] = trim((string) $args['notes']) !== '' ? trim((string) $args['notes']) : null;
        }
        if (!$changes) {
            return ['error' => 'Provide at least one supported bill change.'];
        }
        return $this->request_confirmation('update_bill', ['bill_id' => $id, 'changes' => $changes],
            'Update the ' . $bill['period_month'] . ' bill for ' . $bill['tenant_name'] . ' at '
            . $bill['property_name'] . ', ' . $bill['unit_name'] . ' with: ' . $this->summary($changes) . '?');
    }

    private function update_unit(array $args)
    {
        $id = $this->required_id($args, 'unit_id');
        if (!$this->was_verified('units', $id)) {
            return ['error' => 'Search for and verify the exact unit before editing it.'];
        }
        $unit = $this->owned_unit($id);
        if (!$unit) {
            return ['error' => 'Unit not found in this landlord account.'];
        }
        $changes = [];
        foreach (['unit_name', 'monthly_rent', 'default_deposit', 'default_due_day', 'capacity', 'condition_tag', 'notes'] as $field) {
            if (!array_key_exists($field, $args)) {
                continue;
            }
            if (in_array($field, ['monthly_rent', 'default_deposit'], true)) {
                if (!is_numeric($args[$field]) || (float) $args[$field] < 0
                    || (float) $args[$field] > 99999999.99
                    || ($field === 'monthly_rent' && (float) $args[$field] <= 0)) {
                    return ['error' => $field . ' must be a valid amount.'];
                }
                $changes[$field] = round((float) $args[$field], 2);
            } elseif ($field === 'default_due_day') {
                if (!is_numeric($args[$field]) || (int) $args[$field] < 1 || (int) $args[$field] > 28) {
                    return ['error' => 'Due day must be between 1 and 28.'];
                }
                $changes[$field] = (int) $args[$field];
            } elseif ($field === 'capacity') {
                if (!is_numeric($args[$field]) || (int) $args[$field] < 1 || (int) $args[$field] > 50) {
                    return ['error' => 'Capacity must be between 1 and 50.'];
                }
                $changes[$field] = (int) $args[$field];
            } elseif ($field === 'condition_tag') {
                if (!in_array($args[$field], ['good_condition', 'under_maintenance'], true)) {
                    return ['error' => 'Unsupported unit condition.'];
                }
                $changes[$field] = $args[$field];
            } else {
                if (!is_string($args[$field])) {
                    return ['error' => 'Invalid ' . $field . '.'];
                }
                $max = $field === 'unit_name' ? 50 : 255;
                $value = trim($args[$field]);
                if ($value === '' || mb_strlen($value) > $max) {
                    return ['error' => 'Invalid ' . $field . '.'];
                }
                $changes[$field] = $value;
            }
        }
        if (!$changes) {
            return ['error' => 'Provide at least one supported unit change.'];
        }
        return $this->request_confirmation('update_unit', ['unit_id' => $id, 'changes' => $changes],
            'Update ' . $unit['property_name'] . ', ' . $unit['unit_name'] . ' with: ' . $this->summary($changes) . '?');
    }

    private function update_property(array $args)
    {
        $id = $this->required_id($args, 'property_id');
        if (!$this->was_verified('properties', $id)) {
            return ['error' => 'Search for and verify the exact property before editing it.'];
        }
        $property = $this->owned_property($id);
        if (!$property) {
            return ['error' => 'Property not found in this landlord account.'];
        }
        $changes = [];
        foreach (['name' => 120, 'address' => 255, 'city' => 100, 'barangay' => 100, 'description' => 2000] as $field => $max) {
            if (array_key_exists($field, $args)) {
                if (!is_string($args[$field])) {
                    return ['error' => 'Invalid property ' . $field . '.'];
                }
                $value = trim($args[$field]);
                if ($value === '' || mb_strlen($value) > $max) {
                    return ['error' => 'Invalid property ' . $field . '.'];
                }
                $changes[$field] = $value;
            }
        }
        if (isset($args['type'])) {
            if (!in_array($args['type'], ['apartment', 'boarding_house'], true)) {
                return ['error' => 'Unsupported property type.'];
            }
            $changes['type'] = $args['type'];
        }
        if (!$changes) {
            return ['error' => 'Provide at least one supported property change.'];
        }
        $this->db->transaction();
        try {
            $this->db->table('properties')->where('id', $id)->where('owner_id', $this->ownerId)->update(
                array_merge($changes, ['updated_at' => date('Y-m-d H:i:s')])
            );
            $updated = $this->owned_property($id);
            $this->audit('update', 'properties', $id, $property, $updated);
            $this->db->commit();
            return ['success' => true, 'record' => $updated];
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    private function delete_unit(array $args)
    {
        $id = $this->required_id($args, 'unit_id');
        if (!$this->was_verified('units', $id)) {
            return ['error' => 'Search for and verify the exact unit before archiving it.'];
        }
        $unit = $this->owned_unit($id);
        if (!$unit) {
            return ['error' => 'Unit not found in this landlord account.'];
        }
        if ($this->unit_has_blocking_lease($id)) {
            return ['error' => 'End or cancel all active, scheduled, or offered leases before archiving this unit.'];
        }
        return $this->request_confirmation('delete_unit', ['unit_id' => $id],
            'Archive ' . $unit['property_name'] . ', ' . $unit['unit_name'] . '? Its history will be preserved.');
    }

    private function delete_bill(array $args)
    {
        $id = $this->required_id($args, 'bill_id');
        if (!$this->was_verified('bills', $id)) {
            return ['error' => 'Search for and verify the exact bill before deleting it.'];
        }
        $bill = $this->owned_bill($id);
        if (!$bill || $bill['status'] === 'paid') {
            return ['error' => 'Only an unpaid or overdue bill in this landlord account can be deleted.'];
        }
        if ($this->db->table('payments')->select('id')->where('bill_id', $id)->limit(1)->get()) {
            return ['error' => 'This bill has payment history and cannot be deleted.'];
        }
        return $this->request_confirmation('delete_bill', ['bill_id' => $id],
            'Delete the ' . $bill['period_month'] . ' bill for ' . $bill['tenant_name'] . ' at '
            . $bill['property_name'] . ', ' . $bill['unit_name'] . '?');
    }

    private function confirm_action(array $args)
    {
        if (!$this->is_explicit_confirmation($this->currentMessage)) {
            return ['error' => 'The latest user message is not an explicit confirmation. No action was performed.'];
        }
        $action = $this->db->table('assistant_pending_actions')
            ->select('id, conversation_id, landlord_id, tool, args_json, status, expires_at, created_message_id')
            ->where('conversation_id', $this->conversationId)
            ->where('landlord_id', $this->ownerId)
            ->where('status', 'pending')
            ->order_by('id', 'DESC')
            ->limit(1)
            ->get();
        if (!$action || strtotime((string) $action['expires_at']) <= time()
            || (int) $action['created_message_id'] >= $this->userMessageId) {
            return ['error' => 'That pending action is unavailable, expired, or was not confirmed in a later message.'];
        }
        $id = (int) $action['id'];
        $args = json_decode($action['args_json'], true, 512, JSON_THROW_ON_ERROR);
        $this->db->transaction();
        try {
            $claimed = $this->db->table('assistant_pending_actions')
                ->where('id', $id)
                ->where('status', 'pending')
                ->update(['status' => 'executing']);
            if (!$claimed) {
                $this->db->roll_back();
                return ['error' => 'That pending action is already being processed or is no longer available.'];
            }
            $result = $this->execute_confirmed_action($action['tool'], $args);
            if (isset($result['error'])) {
                $this->db->roll_back();
                return $result;
            }
            $invitation = $result['_invitation'] ?? null;
            unset($result['_invitation']);
            $this->db->table('assistant_pending_actions')->where('id', $id)->where('status', 'executing')
                ->update(['status' => 'completed']);
            $this->audit('execute', $action['tool'], $id, ['args' => $args], $result);
            $this->db->commit();
            if (is_array($invitation)) {
                $emailStatus = $this->send_tenant_invitation($invitation);
                $result['invitation_email_status'] = $emailStatus;
                $result['message'] = $emailStatus === 'sent'
                    ? 'Tenant account and annual lease created; invitation email sent.'
                    : 'Tenant account and annual lease created, but the invitation email could not be sent. Resend the invitation from the tenant list.';
            }
            return ['success' => true, 'action_id' => $id, 'result' => $result];
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }

    private function execute_confirmed_action($tool, array $args)
    {
        if ($tool === 'add_tenant') {
            $required = ['unit_id', 'username', 'email', 'full_name', 'start_date', 'monthly_rent', 'deposit', 'due_day',
                'billing_style', 'prorate_first_month', 'grace_period_days', 'late_fee', 'contract_required'];
            foreach ($required as $field) {
                if (!array_key_exists($field, $args)) {
                    return ['error' => 'The pending tenant action is incomplete. No account was created.'];
                }
            }
            if (!$this->valid_date($args['start_date']) || $args['start_date'] < date('Y-m-d')
                || !is_numeric($args['monthly_rent']) || (float) $args['monthly_rent'] <= 0
                || (float) $args['monthly_rent'] > 99999999.99
                || !is_numeric($args['deposit']) || (float) $args['deposit'] < 0
                || (float) $args['deposit'] > 99999999.99
                || !in_array($args['billing_style'], ['calendar', 'anniversary', 'first_of_month'], true)) {
                return ['error' => 'The pending lease terms are invalid. No account was created.'];
            }
            $userModel = $this->load_model('User_model');
            $unitModel = $this->load_model('Unit_model');
            $leaseModel = $this->load_model('Lease_model');
            $invitationModel = $this->load_model('Tenant_invitation_model');
            if ($userModel->find_by_email($args['email']) || $userModel->field_taken('username', $args['username'])) {
                return ['error' => 'The tenant email or username is no longer available. No account was created.'];
            }
            $unit = $unitModel->available_for_lease((int) $args['unit_id'], true, $this->ownerId);
            if (!$unit) {
                return ['error' => 'The selected unit is no longer available. No account was created.'];
            }
            $template = $unit['contract_template'] ?: ($unit['property_contract_template'] ?? null);
            $template = $template ? json_decode($template, true) : null;
            if (!empty($template['enabled']) !== !empty($args['contract_required'])) {
                return ['error' => 'The unit contract settings changed after confirmation. Review the tenant action again.'];
            }
            $created = $userModel->create_tenant_with_lease([
                'username' => $args['username'],
                'landlord_id' => $this->ownerId,
                'email' => $args['email'],
                'password' => password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT),
                'full_name' => $args['full_name'],
                'phone' => $args['phone'] ?? null,
                'role' => 'tenant',
                'must_change_password' => 1,
            ], [
                'unit_id' => (int) $args['unit_id'],
                'start_date' => $args['start_date'],
                'contract_term' => 'annually',
                'contract_months' => 12,
                'monthly_rent' => (float) $args['monthly_rent'],
                'deposit' => (float) $args['deposit'],
                'due_day' => (int) $args['due_day'],
                'billing_style' => $args['billing_style'],
                'prorate_first_month' => !empty($args['prorate_first_month']),
                'grace_period_days' => (int) $args['grace_period_days'],
                'late_fee' => (float) $args['late_fee'],
                'contract_required' => !empty($args['contract_required']),
            ], $this->ownerId, $unitModel, $leaseModel, $invitationModel);
            if (!$created) {
                return ['error' => 'The selected unit is no longer available. No account was created.'];
            }
            $tenantId = (int) $created['id'];
            $tenant = $created['data'];
            $lease = $this->db->table('leases')
                ->select('id, tenant_id, unit_id, start_date, end_date, monthly_rent, deposit, due_day, status')
                ->where('tenant_id', $tenantId)
                ->where('unit_id', (int) $args['unit_id'])
                ->order_by('id', 'DESC')
                ->limit(1)
                ->get();
            if (!$lease) {
                return ['error' => 'The tenant lease could not be verified. No success was reported.'];
            }
            $this->audit('create', 'users', $tenantId, null, $tenant);
            $this->audit('create', 'leases', (int) $lease['id'], null, $lease);
            return [
                'message' => 'Tenant account and annual lease created.',
                'tenant' => $tenant,
                'lease' => $lease,
                '_invitation' => [
                    'user_id' => $tenantId,
                    'token' => $created['invitation']['token'],
                    'unit_label' => $unit['unit_name'] . ' · ' . $unit['property_name'],
                ],
            ];
        }
        if ($tool === 'create_bill') {
            $lease = $this->owned_lease((int) $args['lease_id']);
            if (!$lease) {
                return ['error' => 'Lease no longer exists in this landlord account.'];
            }
            if ($this->db->table('bills')->select('id')->where('lease_id', (int) $args['lease_id'])
                ->where('period_month', $args['period_month'])->limit(1)->get()) {
                return ['error' => 'A bill already exists for this lease and billing month.'];
            }
            $this->db->table('bills')->insert([
                'lease_id' => (int) $args['lease_id'],
                'tenant_id' => (int) $lease['tenant_id'],
                'period_month' => $args['period_month'],
                'description' => (string) $args['description'],
                'amount' => number_format((float) $args['amount'], 2, '.', ''),
                'due_date' => $args['due_date'],
                'status' => 'unpaid',
                'created_at' => date('Y-m-d H:i:s'),
            ]);
            $billId = (int) $this->db->last_id();
            $bill = $this->owned_bill($billId);
            $this->audit('create', 'bills', $billId, null, $bill);
            return ['message' => 'Bill created.', 'bill' => $bill];
        }
        if ($tool === 'record_payment') {
            $billId = (int) $args['bill_id'];
            $bill = $this->owned_bill($billId);
            if (!$bill || $bill['status'] === 'paid'
                || abs((float) $bill['amount'] - (float) $args['amount']) > 0.009) {
                return ['error' => 'The bill is no longer unpaid or its amount changed. No payment was recorded.'];
            }
            $paymentModel = $this->payment_model();
            $paymentId = $paymentModel->create_pending(
                $billId,
                (int) $bill['tenant_id'],
                number_format((float) $args['amount'], 2, '.', ''),
                $args['method'],
                $this->ownerId,
                !empty($args['notes']) ? $args['notes'] : null
            );
            if (!$paymentModel->settle($paymentId)) {
                return ['error' => 'The payment could not be settled. No successful payment was recorded.'];
            }
            $payment = $this->db->table('payments')
                ->select('id, bill_id, tenant_id, amount, method, status, receipt_no, paid_at')
                ->where('id', $paymentId)
                ->where('tenant_id', (int) $bill['tenant_id'])
                ->limit(1)
                ->get();
            $this->audit('create', 'payments', $paymentId, null, $payment);
            $this->audit('update', 'bills', $billId, $bill, $this->owned_bill($billId));
            return ['message' => 'Payment recorded and bill marked paid.', 'payment' => $payment];
        }
        if ($tool === 'update_bill') {
            $id = (int) $args['bill_id'];
            $before = $this->owned_bill($id);
            if (!$before || $before['status'] === 'paid') {
                return ['error' => 'Unpaid bill not found in this landlord account.'];
            }
            $this->db->table('bills')->where('id', $id)->update($args['changes']);
            $after = $this->owned_bill($id);
            $this->audit('update', 'bills', $id, $before, $after);
            return ['message' => 'Bill updated.', 'bill' => $after];
        }
        if ($tool === 'update_unit') {
            $id = (int) $args['unit_id'];
            $before = $this->owned_unit($id);
            if (!$before) {
                return ['error' => 'Unit not found in this landlord account.'];
            }
            if (isset($args['changes']['unit_name'])
                && $this->db->table('units')->select('id')->where('property_id', (int) $before['property_id'])
                    ->where('unit_name', $args['changes']['unit_name'])->where('id', '<>', $id)->limit(1)->get()) {
                return ['error' => 'That unit name is already in use for this property.'];
            }
            $this->db->table('units')->where('id', $id)->update(
                array_merge($args['changes'], ['updated_at' => date('Y-m-d H:i:s')])
            );
            $after = $this->owned_unit($id);
            $this->audit('update', 'units', $id, $before, $after);
            return ['message' => 'Unit updated.', 'unit' => $after];
        }
        if ($tool === 'delete_unit') {
            $id = (int) $args['unit_id'];
            $before = $this->owned_unit($id);
            if (!$before) {
                return ['error' => 'Unit not found in this landlord account; it was not archived.'];
            }
            $locked = $this->db->raw(
                'SELECT u.id FROM units u
                   JOIN properties p ON p.id = u.property_id
                  WHERE u.id = ? AND p.owner_id = ? AND u.archived_at IS NULL AND p.archived_at IS NULL
                  FOR UPDATE',
                [$id, $this->ownerId]
            )->fetch(PDO::FETCH_ASSOC);
            if (!$locked || $this->unit_has_blocking_lease($id)) {
                return ['error' => 'The unit is unavailable or now has an active, scheduled, or offered lease; it was not archived.'];
            }
            $changed = $this->db->raw(
                'UPDATE units SET archived_at = NOW(), updated_at = NOW()
                  WHERE id = ? AND archived_at IS NULL',
                [$id]
            )->rowCount();
            if (!$changed) {
                return ['error' => 'The unit could not be archived. No changes were made.'];
            }
            $after = array_merge($before, ['archived_at' => date('Y-m-d H:i:s')]);
            $this->audit('archive', 'units', $id, $before, $after);
            return ['message' => 'Unit archived. Its history is preserved.', 'unit_id' => $id];
        }
        if ($tool === 'delete_bill') {
            $id = (int) $args['bill_id'];
            $before = $this->owned_bill($id);
            if (!$before || $before['status'] === 'paid'
                || $this->db->table('payments')->select('id')->where('bill_id', $id)->limit(1)->get()) {
                return ['error' => 'Bill not found, paid, or has payment history; it was not deleted.'];
            }
            $this->db->table('bills')->where('id', $id)->delete();
            $this->audit('delete', 'bills', $id, $before, null);
            return ['message' => 'Bill deleted.', 'bill_id' => $id];
        }
        return ['error' => 'This pending action type is not supported.'];
    }

    private function request_confirmation($tool, array $args, $summary)
    {
        $existing = $this->db->table('assistant_pending_actions')
            ->select('id, created_message_id')
            ->where('conversation_id', $this->conversationId)
            ->where('landlord_id', $this->ownerId)
            ->where('status', 'pending')
            ->get_all(PDO::FETCH_ASSOC);
        foreach ($existing as $pending) {
            if ((int) $pending['created_message_id'] >= $this->userMessageId) {
                return ['error' => 'Only one sensitive action can be prepared per user message.'];
            }
        }
        if ($existing) {
            $this->db->table('assistant_pending_actions')
                ->where('conversation_id', $this->conversationId)
                ->where('landlord_id', $this->ownerId)
                ->where('status', 'pending')
                ->update(['status' => 'cancelled']);
        }
        $this->db->table('assistant_pending_actions')->insert([
            'conversation_id' => $this->conversationId,
            'landlord_id' => $this->ownerId,
            'created_message_id' => $this->userMessageId,
            'tool' => $tool,
            'args_json' => json_encode($args, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'status' => 'pending',
            'expires_at' => date('Y-m-d H:i:s', time() + 600),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
        $actionId = (int) $this->db->last_id();
        return [
            'requires_confirmation' => true,
            'action_id' => $actionId,
            'summary' => $summary,
            'expires_in_seconds' => 600,
        ];
    }

    private function owned_property($id)
    {
        return $this->db->table('properties')
            ->select('id, owner_id, name, type, address, city, barangay, description')
            ->where('id', (int) $id)
            ->where('owner_id', $this->ownerId)
            ->limit(1)->get();
    }

    private function payment_model()
    {
        if (!$this->paymentModel) {
            $this->paymentModel = $this->load_model('Payment_model');
        }
        return $this->paymentModel;
    }

    private function load_model($name)
    {
        $lava = lava_instance();
        $lava->call->model($name);
        return $lava->{$name};
    }

    private function send_tenant_invitation(array $invitation)
    {
        try {
            $lava = lava_instance();
            $lava->call->library('notifier');
            return $lava->notifier->welcome(
                (int) $invitation['user_id'],
                (string) $invitation['token'],
                (string) $invitation['unit_label']
            );
        } catch (Throwable $e) {
            error_log('RentEase assistant tenant invitation failed for user id ' . (int) $invitation['user_id'] . '.');
            return 'failed';
        }
    }

    private function owned_unit($id)
    {
        return $this->db->table('units')
            ->select('units.id, units.property_id, units.unit_name, units.monthly_rent, units.default_deposit, units.default_due_day, units.capacity, units.occupancy_status, units.condition_tag, units.notes, properties.name AS property_name')
            ->join('properties', 'properties.id = units.property_id')
            ->where('units.id', (int) $id)
            ->where('properties.owner_id', $this->ownerId)
            ->where_null('units.archived_at')
            ->where_null('properties.archived_at')
            ->limit(1)->get();
    }

    private function owned_lease($id)
    {
        return $this->db->table('leases')
            ->select('leases.id, leases.tenant_id, leases.unit_id, leases.monthly_rent, leases.status, users.full_name AS tenant_name, units.unit_name, properties.name AS property_name')
            ->join('units', 'units.id = leases.unit_id')
            ->join('properties', 'properties.id = units.property_id')
            ->join('users', 'users.id = leases.tenant_id')
            ->where('leases.id', (int) $id)
            ->where('properties.owner_id', $this->ownerId)
            ->limit(1)->get();
    }

    private function owned_bill($id)
    {
        return $this->bill_query()
            ->select('bills.id, bills.tenant_id, users.full_name AS tenant_name, bills.lease_id, bills.period_month, bills.description, bills.amount, bills.due_date, bills.status, bills.notes, units.id AS unit_id, units.unit_name, properties.id AS property_id, properties.name AS property_name')
            ->where('bills.id', (int) $id)
            ->where('properties.owner_id', $this->ownerId)
            ->limit(1)->get();
    }

    private function unit_has_blocking_lease($id)
    {
        return (bool) $this->db->raw(
            "SELECT 1 FROM leases
              WHERE unit_id = ? AND status IN ('active', 'scheduled', 'offered')
              LIMIT 1 FOR UPDATE",
            [(int) $id]
        )->fetchColumn();
    }

    private function owned_tenant_matches($name, $limit)
    {
        $query = $this->db->table('users')
            ->select('id, full_name')
            ->where('landlord_id', $this->ownerId)
            ->where('role', 'tenant');
        $this->like($query, 'full_name', $name);
        return $query->order_by('full_name')->limit($limit)->get_all(PDO::FETCH_ASSOC);
    }

    private function required_id(array $args, $key)
    {
        if (!isset($args[$key]) || filter_var($args[$key], FILTER_VALIDATE_INT) === false
            || (int) $args[$key] < 1) {
            throw new InvalidArgumentException('A valid ' . $key . ' is required.');
        }
        return (int) $args[$key];
    }

    private function valid_date($date)
    {
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return false;
        }
        $parsed = DateTime::createFromFormat('!Y-m-d', $date);
        return $parsed && $parsed->format('Y-m-d') === $date;
    }

    private function is_explicit_confirmation($message)
    {
        return (bool) preg_match(
            '/^\s*(?:yes|yeah|yep|confirm|confirmed|do it|proceed|go ahead|sige|oo|opo|please do)(?:\s+please)?[.! ]*\s*$/iu',
            (string) $message
        );
    }

    private function summary(array $changes)
    {
        $parts = [];
        foreach ($changes as $key => $value) {
            if (in_array($key, ['amount', 'monthly_rent', 'default_deposit'], true)) {
                $value = '₱' . number_format((float) $value, 2);
            } elseif (is_null($value)) {
                $value = 'cleared';
            }
            $parts[] = str_replace('_', ' ', $key) . ' to ' . $value;
        }
        return implode(', ', $parts);
    }

    private function audit($operation, $entity, $entityId, $before, $after)
    {
        $this->db->table('assistant_audit_logs')->insert([
            'landlord_id' => $this->ownerId,
            'conversation_id' => $this->conversationId ?: null,
            'user_message_id' => $this->userMessageId ?: null,
            'operation' => $operation,
            'entity' => $entity,
            'entity_id' => (int) $entityId,
            'before_json' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'after_json' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    private function lookup_rental_records(array $args)
    {
        $question = mb_strtolower(trim((string) ($args['question'] ?? '')));
        if (preg_match('/\b(payment|payments|paid|received)\b/u', $question)) {
            return $this->get_payments([]);
        }
        if (preg_match('/\b(tenant|tenants|occupant|occupants)\b/u', $question)) {
            return $this->search_tenants([]);
        }
        if (preg_match('/\b(bill|bills|rent|unpaid|overdue|balance|owe)\b/u', $question)) {
            return preg_match('/\b(overdue|late)\b/u', $question)
                ? $this->get_overdue_summary([])
                : $this->get_bills([]);
        }
        if (preg_match('/\b(repair|maintenance)\b/u', $question)) {
            return $this->get_maintenance_requests([]);
        }
        if (preg_match('/\b(lease|leases)\b/u', $question)) {
            return $this->get_leases([]);
        }
        if (preg_match('/\b(unit|units|room|rooms|vacant|occupied)\b/u', $question)) {
            return $this->search_units([]);
        }
        return $this->search_properties([]);
    }
}
