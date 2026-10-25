<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** UnitTransferController - tenant requests and landlord decisions for unit transfers. */
class UnitTransferController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Unit_transfer_model', 'Lease_model', 'Unit_model', 'User_model']);
    }

    public function admin_index()
    {
        $this->api->require_method('GET');
        $rows = $this->Unit_transfer_model->list_requests(null, $this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function tenant_index()
    {
        $this->api->require_method('GET');
        $rows = $this->Unit_transfer_model->list_requests($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function available_units()
    {
        $this->api->require_method('GET');
        $tenant = $this->User_model->find_by_id($this->uid());
        $rows = $this->Unit_model->available_units($tenant['landlord_id'] ?? 0);
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $tenant_id = $this->uid();
        $lease = $this->Lease_model->active_for_tenant($tenant_id);
        if (!$lease) {
            $this->fail('An active lease is required to request a transfer.', 409);
        }
        if ($this->Unit_transfer_model->has_pending($tenant_id)) {
            $this->fail('You already have a pending transfer request.', 409);
        }
        $data = $this->validate($this->input(), [
            'requested_unit_id' => ['type' => 'int', 'required' => true, 'min' => 1],
            'reason' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ]);
        if ((int) $data['requested_unit_id'] === (int) $lease['unit_id']) {
            $this->fail('Choose a different unit.', 422, ['requested_unit_id' => 'This is your current unit.']);
        }
        $tenant = $this->User_model->find_by_id($tenant_id);
        if (!$this->Unit_model->available_for_lease($data['requested_unit_id'], false, $tenant['landlord_id'] ?? 0)) {
            $this->fail('Choose a vacant unit in good condition.', 409, ['requested_unit_id' => 'This unit is not available.']);
        }

        try {
            $id = $this->Unit_transfer_model->create_request(
                $tenant_id, $lease['unit_id'], $data['requested_unit_id'], $data['reason'] ?? null
            );
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000' && $this->Unit_transfer_model->has_pending($tenant_id)) {
                $this->fail('You already have a pending transfer request.', 409);
            }
            throw $e;
        }
        $this->call->model('Inapp_notification_model');
        $this->Inapp_notification_model->notify_landlord($lease['landlord_id'],
            'new_transfer_request', 'New unit transfer request',
            $lease['tenant_name'] . ' requested to move from ' . $lease['unit_name'] . '.',
            $id
        );
        $this->ok(['message' => 'Transfer request sent', 'data' => $this->Unit_transfer_model->find($id)], 201);
    }

    public function decide($id)
    {
        $this->api->require_method('PATCH');
        $decision = $this->validate($this->input(), [
            'status' => ['type' => 'enum', 'required' => true, 'values' => ['approved', 'rejected']],
            'admin_note' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ]);

        $admin_id = $this->uid();
        $outcome = $this->Unit_transfer_model->decide_transactionally(
            $id,
            $decision['status'],
            $decision['admin_note'] ?? null,
            $admin_id,
            function ($request) use ($admin_id) {
                $this->User_model->lock_for_update($request['tenant_id']);
                $lease = $this->Lease_model->active_for_tenant_for_update($request['tenant_id']);
                if (!$lease || (int) $lease['unit_id'] !== (int) $request['current_unit_id']) {
                    return 'tenant_unit_changed';
                }
                $unit = $this->Unit_model->available_for_lease($request['requested_unit_id'], true, $admin_id);
                if (!$unit) {
                    return 'unit_unavailable';
                }
                $this->Lease_model->transfer_active_lease_in_transaction($lease, $unit, $admin_id);
                return null;
            }
        );

        if (isset($outcome['error'])) {
            switch ($outcome['error']) {
                case 'not_found':
                    $this->fail('Transfer request not found.', 404);
                    break;
                case 'already_decided':
                    $this->fail('This transfer request has already been decided.', 409);
                    break;
                case 'tenant_unit_changed':
                    $this->fail('The tenant no longer has the unit associated with this request.', 409);
                    break;
                case 'unit_unavailable':
                    $this->fail('The requested unit is no longer vacant and in good condition.', 409);
                    break;
                default:
                    throw new LogicException('Unexpected unit transfer decision error.');
            }
        }

        $this->call->library('notifier');
        $this->notifier->transfer_result($id);
        $this->ok(['message' => 'Transfer request ' . $decision['status'], 'data' => $outcome['request']]);
    }
}
