<?php
defined('PREVENT_DIRECT_ACCESS') OR exit('No direct script access allowed');

/** Payment_model - every payment attempt/record (table: payments). Settling a payment marks its bill paid. */
class Payment_model extends Model
{
    protected $table = 'payments';

    private const SELECT = "SELECT pm.*, b.period_month, b.description AS bill_description, t.full_name AS tenant_name,
                    u.unit_name, p.name AS property_name
               FROM payments pm
               JOIN bills b      ON b.id = pm.bill_id
               JOIN leases l     ON l.id = b.lease_id
               JOIN units u      ON u.id = l.unit_id
               JOIN properties p ON p.id = u.property_id
               JOIN users t      ON t.id = pm.tenant_id";

    public function list_payments(array $f = [])
    {
        $where = [];
        $args  = [];
        if (!empty($f['tenant_id'])) { $where[] = 'pm.tenant_id = ?'; $args[] = (int) $f['tenant_id']; }
        if (!empty($f['status']))    { $where[] = 'pm.status = ?';    $args[] = $f['status']; }
        if (!empty($f['landlord_id'])) { $where[] = 'p.owner_id = ?'; $args[] = (int) $f['landlord_id']; }
        $sql = self::SELECT . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY pm.id DESC LIMIT 500';
        return $this->db->raw($sql, $args)->fetchAll(PDO::FETCH_ASSOC);
    }

    public function find($id, $landlord_id = null)
    {
        $sql = self::SELECT . ' WHERE pm.id = ?';
        $args = [(int) $id];
        if ($landlord_id !== null) {
            $sql .= ' AND p.owner_id = ?';
            $args[] = (int) $landlord_id;
        }
        return $this->db->raw($sql, $args)->fetch(PDO::FETCH_ASSOC);
    }

    public function find_by_checkout($checkout_id)
    {
        return $this->db->raw(self::SELECT . ' WHERE pm.paymongo_checkout_id = ?', [$checkout_id])->fetch(PDO::FETCH_ASSOC);
    }

    public function create_pending($bill_id, $tenant_id, $amount, $method = 'paymongo', $recorded_by = null, $notes = null)
    {
        $this->db->table($this->table)->insert([
            'bill_id'     => (int) $bill_id,
            'tenant_id'   => (int) $tenant_id,
            'amount'      => $amount,
            'method'      => $method,
            'status'      => 'pending',
            'recorded_by' => $recorded_by,
            'notes'       => $notes,
            'created_at'  => date('Y-m-d H:i:s'),
        ]);
        return (int) $this->db->last_id();
    }

    public function set_checkout($id, $checkout_id)
    {
        return $this->db->raw('UPDATE payments SET paymongo_checkout_id = ? WHERE id = ?', [$checkout_id, (int) $id])->rowCount();
    }

    public function mark_failed($id)
    {
        return $this->db->raw("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'", [(int) $id])->rowCount();
    }

    /** Abandoned checkouts: cancel older pending PayMongo attempts for the bill so only one is live. */
    public function cancel_stale_pending($bill_id)
    {
        return $this->db->raw(
            "UPDATE payments SET status = 'failed' WHERE bill_id = ? AND status = 'pending' AND method = 'paymongo'", [(int) $bill_id]
        )->rowCount();
    }

    /**
     * Settle a payment: payment -> paid (+ receipt number), bill -> paid.
     * Idempotent: the UPDATE only touches rows that are not yet paid, so a webhook that is delivered
     * twice (or a webhook plus a manual verify) settles the payment exactly once.
     *
     * @return bool true when THIS call settled it, false when it was already paid
     */
    public function settle($payment_id, $reference = null)
    {
        $this->db->transaction();
        try {
            $changed = $this->db->raw(
                "UPDATE payments
                    SET status = 'paid', paid_at = NOW(), paymongo_payment_ref = COALESCE(?, paymongo_payment_ref),
                        receipt_no = CONCAT('RCPT-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(id, 5, '0'))
                  WHERE id = ? AND status <> 'paid'",
                [$reference, (int) $payment_id]
            )->rowCount();

            if ($changed) {
                $this->db->raw(
                    "UPDATE bills SET status = 'paid', paid_at = NOW() WHERE id = (SELECT bill_id FROM payments WHERE id = ?)",
                    [(int) $payment_id]
                );
            }
            $this->db->commit();
            return $changed > 0;
        } catch (Throwable $e) {
            $this->db->roll_back();
            throw $e;
        }
    }
}
