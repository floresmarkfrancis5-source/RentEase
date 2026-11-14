<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

class AnnouncementController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Announcement_model', 'Lease_model']);
    }

    public function index()
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->Announcement_model->list_for_landlord($this->uid())]);
    }

    public function published()
    {
        $this->api->require_method('GET');
        $lease = $this->Lease_model->active_for_tenant($this->uid());
        $today = date('Y-m-d');
        if (!$lease || $lease['start_date'] > $today
            || ($lease['end_date'] !== null && $lease['end_date'] < $today)) {
            $this->ok(['data' => []]);
        }
        $this->ok(['data' => $this->Announcement_model->list_for_landlord((int) $lease['landlord_id'], true)]);
    }

    public function create()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), [
            'title' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 160],
            'body' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 5000],
            'is_published' => ['type' => 'bool', 'default' => true],
        ]);
        $id = $this->Announcement_model->create($this->uid(), $data);
        $this->ok([
            'message' => 'Announcement created.',
            'data' => $this->Announcement_model->list_for_landlord($this->uid()),
            'id' => $id,
        ], 201);
    }

    public function update($id)
    {
        $this->api->require_method('PUT');
        $data = $this->validate($this->input(), [
            'title' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 160],
            'body' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 5000],
            'is_published' => ['type' => 'bool', 'required' => true],
        ]);
        if (!$this->Announcement_model->update_announcement($id, $this->uid(), $data)) {
            $exists = $this->Announcement_model->list_for_landlord($this->uid());
            if (!array_filter($exists, static function ($row) use ($id) { return (int) $row['id'] === (int) $id; })) {
                $this->fail('Announcement not found.', 404);
            }
        }
        $this->ok(['message' => 'Announcement updated.', 'data' => $this->Announcement_model->list_for_landlord($this->uid())]);
    }

    public function delete($id)
    {
        $this->api->require_method('DELETE');
        if (!$this->Announcement_model->delete_announcement($id, $this->uid())) {
            $this->fail('Announcement not found.', 404);
        }
        $this->ok(['message' => 'Announcement deleted.', 'data' => $this->Announcement_model->list_for_landlord($this->uid())]);
    }
}
