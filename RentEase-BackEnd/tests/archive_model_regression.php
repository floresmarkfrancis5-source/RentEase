<?php
define('PREVENT_DIRECT_ACCESS', true);

class Model
{
    public $db;
}

class ArchiveRegressionStatement
{
    private $row;
    private $rows;
    private $affected;

    public function __construct($row = false, $rows = [], $affected = 0)
    {
        $this->row = $row;
        $this->rows = $rows;
        $this->affected = $affected;
    }

    public function fetch($mode = null)
    {
        return $this->row;
    }

    public function fetchAll($mode = null)
    {
        return $this->rows;
    }

    public function rowCount()
    {
        return $this->affected;
    }
}

class ArchiveRegressionDatabase
{
    public $queries = [];
    public $blockingLease = false;
    public $commits = 0;
    public $rollbacks = 0;

    public function transaction()
    {
    }

    public function commit()
    {
        $this->commits++;
    }

    public function roll_back()
    {
        $this->rollbacks++;
    }

    public function raw($sql, $args = [])
    {
        $this->queries[] = [$sql, $args];

        if (strpos($sql, 'SELECT id FROM properties WHERE id =') === 0) {
            return new ArchiveRegressionStatement(['id' => (int) $args[0]]);
        }
        if (strpos($sql, 'SELECT id FROM units WHERE property_id =') === 0) {
            return new ArchiveRegressionStatement(false, []);
        }
        if (strpos($sql, 'SELECT l.id FROM leases l') === 0 || strpos($sql, 'SELECT id FROM leases') === 0) {
            return new ArchiveRegressionStatement($this->blockingLease ? ['id' => 3] : false);
        }
        if (strpos($sql, 'SELECT u.id FROM units u') === 0) {
            return new ArchiveRegressionStatement(['id' => (int) $args[0]]);
        }
        if (strpos($sql, 'SELECT u.*') === 0 || strpos($sql, 'SELECT p.*') === 0) {
            return new ArchiveRegressionStatement(false, []);
        }
        if (strpos($sql, 'UPDATE properties SET archived_at = NOW()') === 0
            || strpos($sql, 'UPDATE units SET archived_at = NOW()') === 0
            || strpos($sql, 'UPDATE properties SET archived_at = NULL') === 0
            || strpos($sql, 'UPDATE units u') === 0) {
            return new ArchiveRegressionStatement(false, [], 1);
        }

        throw new RuntimeException('Unexpected archive regression query: ' . $sql);
    }
}

require __DIR__ . '/../app/models/Property_model.php';
require __DIR__ . '/../app/models/Unit_model.php';

function archive_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function archive_model_with_database($class, $database)
{
    $model = new $class();
    $model->db = $database;
    return $model;
}

$db = new ArchiveRegressionDatabase();
$unitModel = archive_model_with_database('Unit_model', $db);
archive_assert($unitModel->archive(8, 4) === 'archived', 'An eligible unit was not archived.');
archive_assert($db->commits === 1 && $db->rollbacks === 0, 'Successful unit archive did not commit.');
archive_assert(
    strpos($db->queries[0][0], 'p.owner_id = ?') !== false
        && strpos($db->queries[1][0], "('active', 'scheduled', 'offered')") !== false
        && !array_filter($db->queries, static function ($query) { return strpos($query[0], 'DELETE') !== false; }),
    'Unit archive was not owner-scoped, lease-guarded, and history-preserving.'
);

$db = new ArchiveRegressionDatabase();
$db->blockingLease = true;
$unitModel = archive_model_with_database('Unit_model', $db);
archive_assert($unitModel->archive(8, 4) === 'has_current_lease', 'A unit with a current lease was archived.');
archive_assert($db->commits === 0 && $db->rollbacks === 1, 'Blocked unit archive did not roll back.');

$db = new ArchiveRegressionDatabase();
$propertyModel = archive_model_with_database('Property_model', $db);
archive_assert($propertyModel->archive(12, 4) === 'archived', 'An eligible property was not archived.');
archive_assert($db->commits === 1 && $db->rollbacks === 0, 'Successful property archive did not commit.');
archive_assert(
    strpos($db->queries[0][0], 'owner_id = ?') !== false
        && strpos($db->queries[2][0], "('active', 'scheduled', 'offered')") !== false,
    'Property archive was not owner-scoped and guarded against current leases.'
);

$db = new ArchiveRegressionDatabase();
$db->blockingLease = true;
$propertyModel = archive_model_with_database('Property_model', $db);
archive_assert($propertyModel->archive(12, 4) === 'has_current_lease', 'A property with a current lease was archived.');
archive_assert($db->commits === 0 && $db->rollbacks === 1, 'Blocked property archive did not roll back.');

$db = new ArchiveRegressionDatabase();
$unitModel = archive_model_with_database('Unit_model', $db);
archive_assert($unitModel->restore(8, 4), 'An individually archived unit under an active property was not restored.');
archive_assert(
    strpos($db->queries[0][0], 'p.archived_at IS NULL') !== false
        && strpos($db->queries[0][0], 'p.owner_id = ?') !== false,
    'Unit restore did not require an active, landlord-owned property.'
);

$db = new ArchiveRegressionDatabase();
$unitModel = archive_model_with_database('Unit_model', $db);
$unitModel->list_units(null, 4);
$activeUnitQuery = $db->queries[0][0];
$unitModel->list_units(null, 4, true);
$archivedUnitQuery = $db->queries[1][0];
archive_assert(
    strpos($activeUnitQuery, 'u.archived_at IS NULL AND p.archived_at IS NULL') !== false
        && strpos($archivedUnitQuery, 'u.archived_at IS NOT NULL OR p.archived_at IS NOT NULL') !== false,
    'Active and archived unit listings did not separate unit and parent-property archive states.'
);

$db = new ArchiveRegressionDatabase();
$propertyModel = archive_model_with_database('Property_model', $db);
$propertyModel->all_with_counts(4);
$activePropertyQuery = $db->queries[0][0];
$propertyModel->all_with_counts(4, true);
$archivedPropertyQuery = $db->queries[1][0];
archive_assert(
    strpos($activePropertyQuery, 'p.archived_at IS NULL') !== false
        && strpos($archivedPropertyQuery, 'p.archived_at IS NOT NULL') !== false,
    'Active and archived property listings were not separated.'
);

echo "Archive model regression checks passed.\n";
