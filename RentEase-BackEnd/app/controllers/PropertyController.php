<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');
require_once __DIR__ . '/BaseApiController.php';

/** PropertyController (admin) - CRUD for apartments / boarding houses incl. map coordinates. */
class PropertyController extends BaseApiController
{
    public function __construct()
    {
        parent::__construct();
        $this->call->model('Property_model');
    }

    private function rules()
    {
        return [
            'name'        => ['type' => 'string', 'required' => true, 'max' => 120],
            'type'        => ['type' => 'enum', 'values' => ['apartment', 'boarding_house'], 'default' => 'apartment'],
            'address'     => ['type' => 'string', 'required' => true, 'max' => 255],
            'city'        => ['type' => 'string', 'max' => 100],
            'barangay'    => ['type' => 'string', 'max' => 100],
            'latitude'    => ['type' => 'decimal', 'min' => -90,  'max' => 90,  'scale' => 7, 'nullable' => true],
            'longitude'   => ['type' => 'decimal', 'min' => -180, 'max' => 180, 'scale' => 7, 'nullable' => true],
            'description' => ['type' => 'string', 'max' => 2000, 'nullable' => true],
        ];
    }

    public function index()
    {
        $this->api->require_method('GET');
        $rows = $this->Property_model->all_with_counts($this->uid());
        $this->ok(['data' => $rows, 'count' => count($rows)]);
    }

    public function show($id)
    {
        $this->api->require_method('GET');
        $this->ok(['data' => $this->not_found_unless($this->Property_model->find($id, $this->uid()), 'Property')]);
    }

    public function store()
    {
        $this->api->require_method('POST');
        $data = $this->validate($this->input(), $this->rules());
        $id   = $this->Property_model->create_property($data, $this->uid());
        $this->ok(['message' => 'Property added', 'data' => $this->Property_model->find($id, $this->uid())], 201);
    }

    public function update($id)
    {
        $partial = $_SERVER['REQUEST_METHOD'] === 'PATCH';
        $this->not_found_unless($this->Property_model->find($id, $this->uid()), 'Property');
        $data = $this->validate($this->input(), $this->rules(), $partial);
        $this->Property_model->update_property($id, $data);
        $this->ok(['message' => 'Property updated', 'data' => $this->Property_model->find($id, $this->uid())]);
    }

    public function destroy($id)
    {
        $this->api->require_method('DELETE');
        $this->not_found_unless($this->Property_model->find($id, $this->uid()), 'Property');
        if ($this->Property_model->has_lease_history($id)) {
            $this->fail('This property has lease records and cannot be deleted. End its leases and keep it for your records.', 409);
        }
        $this->Property_model->delete_property($id);
        $this->ok(['message' => 'Property deleted']);
    }
}
