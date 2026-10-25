<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** UnitController (admin) - rooms/units inside a property. Occupied/vacant is driven by leases. */
class UnitController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model(['Unit_model', 'Property_model']);
    }

    private function rules()
    {
        return [
            'property_id'  => ['type' => 'int', 'required' => true, 'min' => 1],
            'unit_name'    => ['type' => 'string', 'required' => true, 'max' => 50],
            'monthly_rent' => ['type' => 'decimal', 'required' => true, 'min' => 0, 'max' => 99999999.99],
            'capacity'     => ['type' => 'int', 'min' => 1, 'max' => 50, 'default' => 1],
            'condition_tag' => ['type' => 'enum', 'values' => ['good_condition', 'under_maintenance'], 'default' => 'good_condition'],
            'notes'        => ['type' => 'string', 'max' => 255, 'nullable' => true],
        ];
    }

    public function index()
    {
        $this->api->require_method('GET');
        $q    = $this->api->get_query_params();
        $rows = $this->Unit_model->list_units($q['property_id'] ?? null, $this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit')]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), $this->rules());
        $this->not_found_unless($this->Property_model->find($data['property_id'], $this->uid()), 'Property');
        if ($this->Unit_model->name_taken($data['property_id'], $data['unit_name'])) {
            $this->fail('This property already has a unit with that name.', 409, ['unit_name' => 'Already used in this property.']);
        }
        $id = $this->Unit_model->create_unit($data);
        $this->ok(['message' => 'Unit added', 'data' => $this->Unit_model->find($id, $this->uid())], 201);
    }

    public function update($id)
    {
        $partial = $_SERVER['REQUEST_METHOD'] === 'PATCH';
        $unit    = $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit');
        $data    = $this->validate($this->input(), $this->rules(), $partial);

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
        if ($data) {
            $this->Unit_model->update_unit($id, $data);
        }
        $this->ok(['message' => 'Unit updated', 'data' => $this->Unit_model->find($id, $this->uid())]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->Unit_model->find($id, $this->uid()), 'Unit');
        if ($this->Unit_model->has_leases($id)) {
            $this->fail('This unit has lease records and cannot be deleted.', 409);
        }
        $this->Unit_model->delete_unit($id);
        $this->ok(['message' => 'Unit deleted']);
    }
}
