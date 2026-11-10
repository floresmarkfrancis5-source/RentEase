<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** EarlyMoveInController - tenant requests and landlord decisions for early lease starts. */
class EarlyMoveInController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Early_move_in_model', 'Lease_model', 'Inapp_notification_model']);
    }

    public function admin_index()
    {
        $this->api->require_method('GET');
        $rows = $this->Early_move_in_model->list_for_landlord($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function tenant_index()
    {
        $this->api->require_method('GET');
        $rows = $this->Early_move_in_model->list_for_tenant($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $lease = $this->Lease_model->scheduled_for_tenant($this->uid());
        if (!$lease || $lease['start_date'] <= date('Y-m-d')) {
            $this->fail('You need a future scheduled move-in to request an early start.', 409);
        }
        if ($this->Early_move_in_model->has_pending($this->uid())) {
            $this->fail('You already have a pending early move-in request.', 409);
        }
        $data = $this->validate($this->input(), [
            'requested_start_date' => ['type' => 'date', 'required' => true],
            'reason' => ['type' => 'string', 'required' => true, 'min' => 3, 'max' => 2000],
            'acknowledge_terms' => ['type' => 'bool', 'required' => true],
        ]);
        if (!$data['acknowledge_terms']) {
            $this->fail('Confirm the updated lease dates and billing terms before sending the request.', 422, [
                'acknowledge_terms' => 'Acknowledgement is required.',
            ]);
        }
        if ($data['requested_start_date'] < date('Y-m-d') || $data['requested_start_date'] >= $lease['start_date']) {
            $this->fail('Choose a date from today up to the day before your scheduled move-in.', 422, [
                'requested_start_date' => 'The early date must be before the scheduled date.',
            ]);
        }
        $day = (int) date('j', strtotime($data['requested_start_date']));
        if (($lease['billing_style'] === 'first_of_month' && $day !== 1)
            || ($lease['billing_style'] === 'anniversary' && $day > 28)) {
            $this->fail('The requested date does not match the billing schedule stored on this lease.', 422, [
                'requested_start_date' => 'Choose a compatible date for this lease’s billing schedule.',
            ]);
        }

        try {
            $id = $this->Early_move_in_model->create_request(
                $lease,
                $this->uid(),
                $data['requested_start_date'],
                $data['reason']
            );
        } catch (PDOException $e) {
            if ((string) $e->getCode() === '23000' && $this->Early_move_in_model->has_pending($this->uid())) {
                $this->fail('You already have a pending early move-in request.', 409);
            }
            throw $e;
        }

        $this->Inapp_notification_model->notify_landlord(
            $lease['landlord_id'],
            'new_early_move_request',
            'Early move-in request',
            $lease['tenant_name'] . ' asked to start the lease on ' . date('M j, Y', strtotime($data['requested_start_date'])) . '.',
            $id
        );
        $this->ok(['message' => 'Early move-in request sent to your landlord.', 'data' => $this->Early_move_in_model->find($id, null, $this->uid())], 201);
    }

    public function decide($id)
    {
        $this->api->require_method('PATCH');
        $decision = $this->validate($this->input(), [
            'status' => ['type' => 'enum', 'required' => true, 'values' => ['approved', 'rejected']],
            'admin_note' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ]);
        $outcome = $this->Early_move_in_model->decide_transactionally(
            $id,
            $decision['status'],
            $decision['admin_note'] ?? null,
            $this->uid(),
            $this->Lease_model
        );
        if (isset($outcome['error'])) {
            $errors = [
                'not_found' => ['Early move-in request not found.', 404],
                'already_decided' => ['This request has already been decided.', 409],
                'lease_changed' => ['The scheduled lease has changed and this request can no longer be approved.', 409],
                'date_unavailable' => ['The requested early move-in date is no longer available.', 409],
            ];
            [$message, $status] = $errors[$outcome['error']] ?? ['Could not decide this request.', 409];
            $this->fail($message, $status);
        }

        $request = $outcome['request'];
        $this->Inapp_notification_model->create(
            (int) $request['tenant_id'],
            'early_move_result',
            $decision['status'] === 'approved' ? 'Early move-in approved' : 'Early move-in request declined',
            $decision['status'] === 'approved'
                ? 'Your lease will now begin on ' . date('M j, Y', strtotime($request['requested_start_date'])) . '. The original end date is unchanged.'
                : 'Your lease remains scheduled for ' . date('M j, Y', strtotime($request['scheduled_start_date'])) . '. Contact your landlord if you need to discuss another date.',
            (int) $id
        );
        $this->ok(['message' => 'Early move-in request ' . $decision['status'] . '.', 'data' => $request]);
    }

    public function tenant_delete($id)
    {
        $this->api->require_method('DELETE');
        if (!$this->Early_move_in_model->cancel_pending($id, $this->uid())) {
            $this->fail('Pending early move-in request not found.', 404);
        }
        $this->ok(['message' => 'Early move-in request cancelled.']);
    }

    public function admin_delete($id)
    {
        $this->api->require_method('DELETE');
        if (!$this->Early_move_in_model->delete_request($id, $this->uid())) {
            $this->fail('Early move-in request not found.', 404);
        }
        $this->ok(['message' => 'Early move-in request deleted.']);
    }
}
