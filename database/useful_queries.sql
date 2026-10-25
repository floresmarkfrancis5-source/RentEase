-- Handy queries for checking RentEase data (MySQL Workbench / Aiven console)

-- Who can log in
SELECT id, username, email, role, is_active, must_change_password FROM users ORDER BY id;

-- Occupancy: every unit and its current tenant
SELECT p.name AS property, un.unit_name, un.status, u.full_name AS tenant
FROM units un
JOIN properties p ON p.id = un.property_id
LEFT JOIN leases l ON l.unit_id = un.id AND l.status = 'active'
LEFT JOIN users u ON u.id = l.tenant_id
ORDER BY p.name, un.unit_name;

-- Unpaid and overdue bills with tenant
SELECT b.id, b.period_month, u.full_name, b.amount, b.due_date, b.status
FROM bills b JOIN users u ON u.id = b.tenant_id
WHERE b.status IN ('unpaid', 'overdue')
ORDER BY b.due_date;

-- Money collected per month
SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, COUNT(*) AS payments, SUM(amount) AS collected
FROM payments WHERE status = 'paid'
GROUP BY month ORDER BY month DESC;

-- Receipts issued
SELECT receipt_no, bill_id, amount, method, paid_at FROM payments WHERE status = 'paid' ORDER BY id DESC;

-- Open maintenance requests
SELECT m.id, m.title, m.priority, m.status, u.full_name AS tenant, m.created_at
FROM maintenance_requests m JOIN users u ON u.id = m.tenant_id
WHERE m.status <> 'resolved'
ORDER BY FIELD(m.priority, 'high', 'medium', 'low'), m.created_at;

-- Current website settings and who changed them
SELECT setting_key, setting_value, setting_group, updated_at FROM site_settings ORDER BY setting_group, setting_key;
SELECT l.changed_at, l.setting_key, l.old_value, l.new_value, u.username
FROM site_settings_log l LEFT JOIN users u ON u.id = l.changed_by ORDER BY l.id DESC LIMIT 50;
