-- =====================================================================
--  RentEase demo data  (run AFTER schema.sql / migrations)
--
--  Demo logins (CHANGE OR DELETE THESE BEFORE ANY REAL USE):
--     landlord (admin)  admin@rentease.test   /  Admin@12345
--     tenant            juan@rentease.test    /  Tenant@12345
--  Passwords are stored as bcrypt hashes, exactly how the API stores them.
-- =====================================================================
SET NAMES utf8mb4;

-- Site settings defaults (the migrations already do this; harmless to re-run)
INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES
  ('site_name', 'RentEase', 'branding'),
  ('site_tagline', 'Rental billing, made effortless', 'branding'),
  ('logo_url', '', 'branding'),
  ('footer_text', 'Built for landlords and tenants of apartments and boarding houses.', 'branding'),
  ('accent_color', '#7c4fe0', 'colors'),
  ('header_color', '#0d0817', 'colors'),
  ('hero_color_from', '#5a2fb8', 'colors'),
  ('hero_color_to', '#1a0f2c', 'colors'),
  ('hero_title', 'Rent collection, without the notebook.', 'hero'),
  ('hero_subtitle', 'Units, tenants, monthly billing, online payments and repair requests — in one calm, centralized place.', 'hero'),
  ('hero_cta_text', 'Get started', 'hero'),
  ('hero_image_url', '', 'hero'),
  ('login_image_url', '', 'hero'),
  ('default_theme', 'system', 'appearance'),
  ('glass_blur', '18', 'appearance'),
  ('glass_opacity', '55', 'appearance')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

INSERT INTO users (username, email, password, full_name, role, is_active, must_change_password) VALUES
('admin', 'admin@rentease.test', '$2y$10$J8HJGrZ.ap6fUvG1/EY1wePkHB9n.OmEhdpPzquJffoZVbv6a7H/q', 'Demo Landlord', 'admin', 1, 0),
('juan',  'juan@rentease.test',  '$2y$10$o3CIeLjIvpoB6EFK/KuYXecqPKyXQJqVy3XcZyiBHm0Uk47YE3UD6', 'Juan Dela Cruz', 'tenant', 1, 0)
ON DUPLICATE KEY UPDATE username = username;

UPDATE users tenant JOIN users landlord ON landlord.email = 'admin@rentease.test' AND landlord.role = 'admin'
   SET tenant.landlord_id = landlord.id
 WHERE tenant.email = 'juan@rentease.test' AND tenant.role = 'tenant' AND tenant.landlord_id IS NULL;

INSERT INTO properties (owner_id, name, type, address, city, latitude, longitude, description)
SELECT id, 'Sunrise Apartments', 'apartment', '123 Rizal Street', 'Manila', 14.5995000, 120.9842000, 'Demo apartment building'
FROM users WHERE email = 'admin@rentease.test'
  AND NOT EXISTS (SELECT 1 FROM properties WHERE name = 'Sunrise Apartments') LIMIT 1;

INSERT IGNORE INTO units (property_id, unit_name, monthly_rent, capacity, occupancy_status, condition_tag)
SELECT id, 'Unit 1A', 6500.00, 2, 'vacant', 'good_condition' FROM properties WHERE name = 'Sunrise Apartments' LIMIT 1;
INSERT IGNORE INTO units (property_id, unit_name, monthly_rent, capacity, occupancy_status, condition_tag)
SELECT id, 'Unit 1B', 5500.00, 1, 'vacant', 'under_maintenance' FROM properties WHERE name = 'Sunrise Apartments' LIMIT 1;

INSERT INTO leases (unit_id, tenant_id, start_date, monthly_rent, deposit, due_day, status)
SELECT un.id, u.id, DATE_FORMAT(CURDATE(), '%Y-%m-01'), un.monthly_rent, 6500.00, 5, 'active'
FROM units un JOIN users u ON u.email = 'juan@rentease.test' WHERE un.unit_name = 'Unit 1A'
  AND NOT EXISTS (SELECT 1 FROM leases WHERE status = 'active' AND unit_id = un.id) LIMIT 1;

UPDATE units un SET occupancy_status = CASE WHEN EXISTS (
  SELECT 1 FROM leases l WHERE l.unit_id = un.id AND l.status = 'active'
) THEN 'occupied' ELSE 'vacant' END;

-- A bill for the current month (the API can also generate these: POST /api/admin/bills/generate)
INSERT IGNORE INTO bills (lease_id, tenant_id, period_month, description, amount, due_date, status)
SELECT l.id, l.tenant_id, DATE_FORMAT(CURDATE(), '%Y-%m'), CONCAT('Rent for ', DATE_FORMAT(CURDATE(), '%M %Y'), ' - Unit 1A'),
       l.monthly_rent, DATE_FORMAT(CURDATE(), '%Y-%m-05'), 'unpaid'
FROM leases l LIMIT 1;
