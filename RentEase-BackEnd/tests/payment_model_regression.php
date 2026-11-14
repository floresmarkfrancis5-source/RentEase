<?php
define('PREVENT_DIRECT_ACCESS', true);

class Model
{
    public $db;
}

class PaymentRegressionStatement
{
    private $row;
    private $affected;

    public function __construct($row = false, $affected = 0)
    {
        $this->row = $row;
        $this->affected = $affected;
    }

    public function fetch($mode = null)
    {
        return $this->row;
    }

    public function rowCount()
    {
        return $this->affected;
    }
}

class PaymentRegressionDatabase
{
    public $payments = [];
    public $bills = [];
    public $queries = [];
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

        if (strpos($sql, 'SELECT id, bill_id, status FROM payments') === 0) {
            return new PaymentRegressionStatement($this->payments[(int) $args[0]] ?? false);
        }

        if (strpos($sql, 'SELECT id, status FROM bills') === 0) {
            return new PaymentRegressionStatement($this->bills[(int) $args[0]] ?? false);
        }

        if (strpos($sql, "UPDATE payments SET status = 'failed'") === 0) {
            $id = (int) $args[0];
            if (($this->payments[$id]['status'] ?? null) === 'pending') {
                $this->payments[$id]['status'] = 'failed';
                return new PaymentRegressionStatement(false, 1);
            }
            return new PaymentRegressionStatement();
        }

        if (strpos($sql, 'UPDATE payments') === 0 && strpos($sql, "status = 'paid'") !== false) {
            $id = (int) $args[1];
            if (($this->payments[$id]['status'] ?? null) === 'pending') {
                $this->payments[$id]['status'] = 'paid';
                return new PaymentRegressionStatement(false, 1);
            }
            return new PaymentRegressionStatement();
        }

        if (strpos($sql, 'UPDATE bills SET status =') === 0) {
            $id = (int) $args[0];
            if (in_array($this->bills[$id]['status'] ?? null, ['unpaid', 'overdue'], true)) {
                $this->bills[$id]['status'] = 'paid';
                return new PaymentRegressionStatement(false, 1);
            }
            return new PaymentRegressionStatement();
        }

        throw new RuntimeException('Unexpected payment regression query: ' . $sql);
    }
}

require __DIR__ . '/../app/models/Payment_model.php';

function payment_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function payment_model_with($paymentRows, $billRows)
{
    $model = new Payment_model();
    $db = new PaymentRegressionDatabase();
    $db->payments = $paymentRows;
    $db->bills = $billRows;
    $model->db = $db;
    return [$model, $db];
}

[$model, $db] = payment_model_with(
    [1 => ['id' => 1, 'bill_id' => 10, 'status' => 'pending']],
    [10 => ['id' => 10, 'status' => 'unpaid']]
);
payment_assert($model->settle(1, 'pay_ref') === true, 'A pending payment for an unpaid bill did not settle.');
payment_assert($db->payments[1]['status'] === 'paid' && $db->bills[10]['status'] === 'paid', 'Settlement did not update both records.');
payment_assert($db->commits === 1, 'Successful settlement did not commit.');
payment_assert(
    strpos($db->queries[0][0], 'FOR UPDATE') !== false && strpos($db->queries[1][0], 'FOR UPDATE') !== false,
    'Settlement did not lock both the payment and bill rows.'
);

[$model, $db] = payment_model_with(
    [1 => ['id' => 1, 'bill_id' => 10, 'status' => 'failed']],
    [10 => ['id' => 10, 'status' => 'unpaid']]
);
payment_assert($model->settle(1) === false, 'A failed/stale payment attempt was settled.');
payment_assert($db->bills[10]['status'] === 'unpaid', 'A stale attempt changed the bill status.');

[$model, $db] = payment_model_with(
    [2 => ['id' => 2, 'bill_id' => 10, 'status' => 'pending']],
    [10 => ['id' => 10, 'status' => 'paid']]
);
payment_assert($model->settle(2) === false, 'A second attempt settled an already-paid bill.');
payment_assert($db->payments[2]['status'] === 'failed', 'A superseded pending attempt was not closed.');
payment_assert($db->commits === 1, 'Closing a superseded attempt did not commit.');

echo "Payment model regression checks passed.\n";
