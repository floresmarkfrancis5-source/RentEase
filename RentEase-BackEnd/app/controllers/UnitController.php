<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** UnitController (admin) - rooms/units inside a property. Occupied/vacant is driven by leases. */
class UnitController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Unit_model', 'Property_model', 'Lease_model']);
    }

    private function rules()
    {
        return [
            'property_id'  => ['type' => 'int', 'required' => true, 'min' => 1],
            'unit_name'    => ['type' => 'string', 'required' => true, 'max' => 50],
            'monthly_rent' => ['type' => 'decimal', 'required' => true, 'min' => 0, 'max' => 99999999.99],
            'default_deposit' => ['type' => 'decimal', 'min' => 0, 'max' => 99999999.99, 'default' => 0],
            'default_due_day' => ['type' => 'int', 'min' => 1, 'max' => 28, 'default' => 5],
            'capacity'     => ['type' => 'int', 'min' => 1, 'max' => 50, 'default' => 1],
            'condition_tag' => ['type' => 'enum', 'values' => ['good_condition', 'under_maintenance'], 'default' => 'good_condition'],
            'notes'        => ['type' => 'string', 'max' => 255, 'nullable' => true],
        ];
    }

    public function index()
    {
        $this->api->require_method('GET');
        $this->Lease_model->sync_lifecycle();
        $q    = $this->api->get_query_params();
        $rows = $this->Unit_model->list_units($q['property_id'] ?? null, $this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit')]);
    }

    private function handle_image_upload(&$data, $in)
    {
        if (!empty($in['image']) && is_string($in['image']) && str_starts_with($in['image'], 'data:image/')) {
            try {
                $cloudinary = $this->call->library('cloudinary');
                if (!$cloudinary || !method_exists($cloudinary, 'configured')) {
                    $cloudinary = load_class('cloudinary', 'libraries');
                }
                if ($cloudinary && method_exists($cloudinary, 'configured') && $cloudinary->configured()) {
                    $res = $cloudinary->upload($in['image'], 'rentease/units');
                    if (!empty($res['url'])) {
                        $data['image_url'] = $res['url'];
                    }
                }
            } catch (Throwable $e) {}
        } elseif (array_key_exists('image_url', $in)) {
            $data['image_url'] = !empty($in['image_url']) ? $in['image_url'] : null;
        }
    }

    public function store()
    {
        $this->api->require_method('POST');
        $in   = $this->input();
        $data = $this->validate($in, $this->rules());
        if (array_key_exists('contract_template', $in)) {
            $data['contract_template'] = $this->contract_template($in['contract_template']);
        }
        $this->not_found_unless($this->Property_model->find($data['property_id'], $this->uid()), 'Property');
        if ($this->Unit_model->name_taken($data['property_id'], $data['unit_name'])) {
            $this->fail('This property already has a unit with that name.', 409, ['unit_name' => 'Already used in this property.']);
        }
        $this->handle_image_upload($data, $in);
        $id = $this->Unit_model->create_unit($data);
        $this->ok(['message' => 'Unit added', 'data' => $this->Unit_model->find($id, $this->uid())], 201);
    }

    public function update($id)
    {
        $partial = $_SERVER['REQUEST_METHOD'] === 'PATCH';
        $unit    = $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit');
        $in      = $this->input();
        $data    = $this->validate($in, $this->rules(), $partial);
        if (array_key_exists('contract_template', $in)) {
            $data['contract_template'] = $this->contract_template($in['contract_template']);
        }

        $pid = $data['property_id'] ?? $unit['property_id'];
        if (isset($data['property_id'])) {
            $this->not_found_unless($this->Property_model->find($pid, $this->uid()), 'Property');
            if ($unit['lease_id'] && (int) $pid !== (int) $unit['property_id']) {
                $this->fail('A unit with an active lease cannot be moved to another property.', 409);
            }
        }
        if (isset($data['unit_name']) && $this->Unit_model->name_taken($pid, $data['unit_name'], $id)) {
            $this->fail('This property already has a unit with that name.', 409, ['unit_name' => 'Already used in this property.']);
        }
        $this->handle_image_upload($data, $in);
        if ($data) {
            $this->Unit_model->update_unit($id, $data);
        }
        $this->ok(['message' => 'Unit updated', 'data' => $this->Unit_model->find($id, $this->uid())]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $unit = $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit');

        // Check if unit is actively occupied
        $activeLease = $this->db->raw(
            "SELECT id FROM leases WHERE unit_id = ? AND status IN ('active','scheduled') LIMIT 1",
            [(int) $id]
        )->fetch(PDO::FETCH_ASSOC);

        if ($activeLease || $unit['occupancy_status'] === 'occupied') {
            $this->fail('Cannot delete this unit because it has an active or scheduled move-in. End or cancel the lease first.', 409);
        }

        // Transactional deletion: remove historical references so foreign keys don't block deletion
        $this->db->transaction();
        try {
            $this->db->raw("DELETE FROM unit_transfer_requests WHERE current_unit_id = ? OR requested_unit_id = ?", [(int) $id, (int) $id]);
            $this->db->raw("DELETE FROM maintenance_images WHERE maintenance_id IN (SELECT id FROM maintenance_requests WHERE unit_id = ?)", [(int) $id]);
            $this->db->raw("DELETE FROM maintenance_requests WHERE unit_id = ?", [(int) $id]);
            $this->db->raw("DELETE FROM lease_documents WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)", [(int) $id]);
            $this->db->raw("DELETE FROM lease_events WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)", [(int) $id]);
            $this->db->raw("DELETE FROM bills WHERE lease_id IN (SELECT id FROM leases WHERE unit_id = ?)", [(int) $id]);
            $this->db->raw("DELETE FROM leases WHERE unit_id = ?", [(int) $id]);
            $this->Unit_model->delete_unit($id);
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }

        $this->ok(['message' => "Unit \"{$unit['unit_name']}\" deleted successfully."]);
    }
}
